# db/migrations-pg — Migrações Postgres (TASK-063 · Etapa 3 do ADR-012)

> ⚠️ **`node db/migrate.mjs` NÃO roda aqui.** Aquele runner é `better-sqlite3` e
> aplicaria este SQL contra o `keys.db`. As migrações deste diretório são aplicadas
> ao projeto Supabase, não ao arquivo local.

## Por que um diretório separado

Durante a Etapa 3 os dois dialetos coexistem: o `keys.db` segue sendo a fonte vigente
até a Etapa 7 (plano de reversão do ADR-012), e o Postgres é cópia. Dividir
`db/migrations/` com o SQLite faria o runner tentar aplicar SQL Postgres no arquivo
local — não há como o runner distinguir os dois pelo nome do arquivo.

Decisão D1 da Sprint 20, aprovada pelo usuário em 2026-09-03.

## Regras — as mesmas do lado SQLite

1. **Todo UP tem um DOWN pareado pelo mesmo prefixo de timestamp** (constitution §4.1).
   UP sem DOWN é BLOQUEADOR: o Gate 2 do `scripts/ci-gates.sh` verifica **este**
   diretório além de `db/migrations/`.
2. **O DOWN é escrito ANTES do UP** e restaura o estado exato anterior. Perda
   irreversível de dados vai documentada como comentário no topo do DOWN.
3. **Nomenclatura:** `YYYYMMDDHHMM_descricao.up.sql` / `.down.sql`.

## Como aplicar

Enquanto não há driver Postgres no projeto (a conexão é a TASK-068, Sprint 21), as
migrações são aplicadas ao Supabase pelo MCP, e a verificação é feita lendo o catálogo
de volta (`information_schema`, `pg_indexes`) — o resultado fica registrado no Report
da sprint.

A partir da Sprint 21, quando a `DATABASE_URL` existir, este diretório ganha um runner
próprio equivalente ao `db/migrate.mjs`.

## Estado

| Migration | Conteúdo |
|---|---|
| `202609031200_baseline_postgres` | Equivalente da baseline SQLite + `justification` + `rate_limit_hits`. Sem `employees`/`employee_id` (TASK-066). Sem índices — TASK-064. |

O mapa das conversões de **consulta** (as que tocam código de aplicação, na Sprint 21)
está em [`docs/migracao-dialeto-sql.md`](../../docs/migracao-dialeto-sql.md). As
conversões de **schema** estão comentadas no cabeçalho de cada `.up.sql`.
