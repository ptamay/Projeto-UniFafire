# Mapa de conversão SQLite → Postgres

> Gerado na **TASK-063** (Sprint 20 · Etapa 3 do ADR-012). É o **oráculo da Sprint 21**:
> a Etapa 3 entrega o schema, e cada linha abaixo vira uma conversão de código lá.
>
> Escopo: conversões de **consulta**, que tocam código de aplicação. As conversões de
> **schema** (tipo, default, chave primária) já estão aplicadas em
> `db/migrations-pg/202609031200_baseline_postgres.up.sql`, com a justificativa de cada
> uma no cabeçalho do arquivo.
>
> As ocorrências foram levantadas com `grep` sobre `src/` em 2026-09-03. Linhas podem
> deslocar; a lista de arquivos é o que importa.

---

## 1. Placeholder posicional — `?` → `$1, $2, …`

**Alcance:** toda consulta parametrizada do sistema (as 103 auditadas no ADR-012).

O `better-sqlite3` usa `?` posicional; o driver Postgres usa `$n` numerado. Não é
opcional nem cosmético: `?` é erro de sintaxe no Postgres.

Isto **não afrouxa a constitution §1.3** — a regra é *parâmetro vinculado*, não a forma
do marcador. O que continua BLOQUEADOR é interpolar valor em string de SQL.

Risco da conversão: consultas montadas dinamicamente, onde a numeração precisa
acompanhar a ordem de `push` no array de condições. Os dois pontos onde isso acontece:

- `src/lib/history-query.ts` — filtros do histórico (TASK-056)
- `src/app/api/logs/route.ts` — filtros da trilha de auditoria

---

## 2. `lastInsertRowid` → `RETURNING id`

O `better-sqlite3` devolve o id do último insert no objeto de retorno de `.run()`. O
Postgres não tem equivalente confiável: o id vem da própria instrução, com `RETURNING`.

```sql
-- SQLite:   const info = db.prepare('INSERT INTO keys (...) VALUES (...)').run(...)
--           info.lastInsertRowid
-- Postgres: INSERT INTO keys (...) VALUES (...) RETURNING id
```

**9 ocorrências, em 3 arquivos:**

| Arquivo | Ocorrências |
|---|---|
| `src/app/api/transactions/route.ts` | 7 — cada ramo de criação de transação |
| `src/app/api/keys/route.ts` | 1 |
| `src/app/api/users/route.ts` | 1 |

As 7 de `transactions/route.ts` são o caso sensível: o id alimenta o `INSERT` seguinte
em `history`, dentro da mesma transação.

---

## 3. Comparação de booleano com `0` / `1`

O SQLite não tem `boolean`: `active`, `requires_password_change` e `success` guardam
0/1. No schema Postgres são `boolean` de verdade (ver TASK-063), e `active = 1` passa a
ser **erro de tipo** — o que é bom: falha alto em vez de silenciosamente nunca casar.

**15 ocorrências, em 11 arquivos:**

| Arquivo | Trecho |
|---|---|
| `src/app/api/auth/login/route.ts` | `active = 1` · `requires_password_change = 0` |
| `src/app/api/keys/route.ts` | `k.active = 1` · `SET active = 0` |
| `src/app/api/users/route.ts` | `active = 1` (×2) · `SET active = 0` · `VALUES (…, 1)` |
| `src/app/api/users/reset-password/route.ts` | `requires_password_change = 1` |
| `src/app/api/transactions/route.ts` | `active = 1` (×2) |
| `src/app/api/metrics/frequent-keys/route.ts` | `k.active = 1` (×2) |
| `src/app/api/metrics/frequent-users/route.ts` | `u.active = 1` |
| `src/lib/session.ts` | `active = 1` |
| `src/lib/security-profile.ts` | `success = 0` |

Conversão: `active = 1` → `active` (ou `active IS TRUE`); `active = 0` → `NOT active`;
`SET active = 0` → `SET active = false`.

---

## 4. `json_object(...)` → `json_build_object(...)`

Mesma ideia, nome e assinatura diferentes: o SQLite alterna chave e valor em uma lista
plana; o `json_build_object` do Postgres também, mas o nome muda e o tipo de retorno é
`json`, não texto — o `JSON.parse` do lado do JavaScript deixa de ser necessário.

**1 ocorrência:** `src/app/api/keys/route.ts` — subconsulta `pending_info`, que monta o
estado da transação pendente de cada chave.

---

## 5. `strftime('%H', ...)` → `EXTRACT` com fuso explícito

O filtro por hora da trilha de auditoria. Precisa de atenção redobrada: a TASK-055
corrigiu exatamente esta área, prendendo a exibição a `America/Recife` via
`APP_TIMEZONE`. Com `timestamptz`, extrair a hora **sem** converter o fuso reintroduz o
mesmo defeito por outro caminho.

```sql
-- SQLite:   strftime('%H', h.timestamp) = ?
-- Postgres: EXTRACT(HOUR FROM h.timestamp AT TIME ZONE $1) = $2
```

**2 ocorrências:**

- `src/lib/history-query.ts` — filtro de hora do histórico
- `src/app/api/logs/route.ts` — filtro de hora dos logs

Os filtros de **dia e mês** não entram aqui: a TASK-055 já os converteu para faixa
`[início, fim)`, que é sargável e neutra de dialeto.

---

## 6. `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`

**1 ocorrência:** `src/lib/db-maintenance.ts` — inserção da flag em `_maintenance_mode`.

**Esta linha desaparece na TASK-065**, não é convertida: no Postgres o bypass da
imutabilidade vira `set_config('app.maintenance_mode', 'on', true)`, de escopo
transacional, e a tabela-flag deixa de existir. Fica registrada aqui para que a Sprint 21
não a converta por engano.

`ON CONFLICT (…) DO UPDATE` já é usado em `src/app/api/settings/route.ts` (4×) com
sintaxe idêntica nos dois dialetos — **não precisa de conversão**.

---

## 7. Chamadas síncronas → assíncronas

A maior conversão da Sprint 21 e a razão de ela ser a maior das sete etapas: **158
chamadas em 31 arquivos** (levantamento do ADR-012). `better-sqlite3` é síncrono por
design; qualquer driver Postgres é assíncrono. Não há adaptador que evite isso.

- `db.prepare(sql).get(...)` → `await client.query(sql, params)` → `rows[0]`
- `db.prepare(sql).all(...)` → `await client.query(sql, params)` → `rows`
- `db.prepare(sql).run(...)` → `await client.query(sql, params)` → `rowCount`
- `db.transaction(() => …)()` → `BEGIN` / `COMMIT` / `ROLLBACK` em client dedicado
  (**3 usos** — TASK-070)

Alcança também os Server Components, que hoje consultam o banco de forma síncrona
durante o render.

---

## 8. Fora do alcance da conversão de SQL

| Item | Onde resolve |
|---|---|
| Proxy global e `resetConnection()` de `src/lib/db.ts` — não sobrevivem a instâncias efêmeras | TASK-068 |
| `bcrypt` (addon nativo) → `bcryptjs` | TASK-071 |
| `PRAGMA foreign_keys = ON` — no Postgres FK é sempre imposta, o pragma some | TASK-068 |
| Backup por cópia de arquivo (`restore/route.ts`) | TASK-078 |
