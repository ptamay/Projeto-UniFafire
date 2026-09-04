# tasks.md — Micro-spec da Sprint Ativa (Sprint 21 · 🔴 crítica)

> **Etapa 4 do ADR-012 — Camada de Dados Assíncrona.** A maior das sete etapas.
> `better-sqlite3` é síncrono por design e qualquer driver Postgres é assíncrono: não há
> adaptador que evite a reescrita. A rede de segurança é a suíte de testes — e é por isso
> que a primeira decisão da sprint era contra qual banco ela roda.
>
> Canal: Claude Code · Modelo: Opus 5 · Esforço: alto.
> Criticidade 🔴: toca autenticação, as 3 transações e os 4 fluxos críticos do spec §4.
>
> **Inventário medido em 2026-09-03** (o ADR-012 estimava 158 em 31 arquivos):
> **162 chamadas** `db.prepare(...).get/all/run` em **28 arquivos**, 3 usos de
> `db.transaction`, 2 usos de `resetConnection`, `bcrypt` em 6 arquivos, e
> **4 Server Components** consultando o banco durante o render.

---

## Decisões de execução

**D1 — ✅ APROVADA pelo usuário (2026-09-03): Postgres real em container** para os testes.
Recomendação do próprio ADR-012. Testar contra dialeto diferente do de produção anularia
boa parte da garantia justamente na sprint que reescreve 162 chamadas — e não exercitaria
os triggers PL/pgSQL nem o bypass por `set_config` que a TASK-065 entregou.
Docker está instalado (v29.6.2, Compose v5.3.1); **o daemon precisa estar rodando.**

**D2 — Driver: `pg` (node-postgres).** Não é escolha entre iguais:
- É o driver de referência do Postgres em Node, e o que a documentação do Supabase assume.
- Funciona com o **pooler em transaction mode** (Supavisor), que é o modo exigido por
  execução serverless — cada requisição pega e devolve a conexão.
- ⚠️ **Transaction mode não suporta prepared statements nomeados.** Toda consulta usa
  `client.query(texto, valores)` sem `name`. Isso **não afrouxa §1.3**: a regra é
  *parâmetro vinculado*, e `$1, $2` são exatamente isso — muda o marcador, não o mecanismo.

Alternativa descartada: `postgres` (porsager), mais leve, mas com menos material de
referência para o modo pooler e uma API de template tags que esconde onde o parâmetro entra
— o oposto do que se quer numa cláusula anti-injeção auditável.

`pg` entra em `plan.md` → Decisões (D-09), como a constitution §0 exige de qualquer adição
de stack.

**D3 — `better-sqlite3` permanece como devDependency, não some.**
`db/migrate.mjs` e `db/load-pg.mjs` continuam precisando dele: são as ferramentas offline
que aplicam as migrations do `keys.db` e fazem a carga da Etapa 7. O que sai é o uso em
**runtime** — `src/lib/db.ts` e os 28 arquivos.

**D4 — Como converter 162 chamadas sem um commit gigante nem um estado quebrado.**
O módulo novo (`src/lib/pg.ts`) nasce **ao lado** de `src/lib/db.ts`, e a conversão anda por
fatias, cada uma com seu par test→feat. Toda fatia fecha com a suíte inteira verde.
`src/lib/db.ts` e o `better-sqlite3` de runtime são apagados na última fatia.

O custo dessa escolha é honesto e temporário: durante a TASK-069 o setup de teste sustenta
os dois bancos — Postgres em container para o que já migrou, SQLite em memória para o que
falta. É o "duplo dialeto" que o ADR desaconselha, mas **transitório e por arquivo, nunca
para a mesma consulta**. A alternativa (um único commit com 28 arquivos) trocaria isso por
uma revisão impossível e um único ponto de falha.

Fatias da TASK-069, na ordem de dependência:

| Fatia | Arquivos | Por que nesta ordem |
|---|---|---|
| **a — `src/lib/`** | `session`, `security-profile`, `logger`, `business-metrics`, `db-maintenance`, `backup`, `history-query` | Todo o resto depende deles |
| **b — auth e conta** | `auth/login`, `account/profile`, `account/security/password`, `users/change-password`, `users/reset-password` | Fluxo crítico nº 1; casa com a TASK-071 |
| **c — transações** | `transactions/route` (20 chamadas), `[id]/user-confirm` (11), `[id]/cancel`, `pending` | O coração do domínio e a fatia mais pesada |
| **d — demais rotas** | `keys`, `users`, `users/role`, `logs`, `metrics/*`, `settings`, `history/clear`, `settings/clear-database` | Independentes entre si |
| **e — Server Components** | `page.tsx`, `history/page.tsx`, `keys/page.tsx`, `account/profile/page.tsx` | Consultam no render; fecham o ciclo e permitem apagar `db.ts` |

---

## TASK-068: Conexão via pooler e o módulo de acesso a dados

**Contexto**: `src/lib/db.ts` guarda a conexão em `global.db`, expõe um `Proxy` que
redireciona toda propriedade para a instância corrente, e oferece `resetConnection()` para
fechar o banco, trocar o arquivo no disco e reabrir. Os três pressupostos morrem em execução
serverless: não há processo longo para guardar o global, não há arquivo para trocar, e a
instância pode ser destruída entre duas requisições.

`resetConnection()` tem 2 usos, ambos em rotas de backup (`backups/import`,
`backups/restore`) que fazem cópia de arquivo. **O ADR-012 já classificou essas rotas como
"desativar, não deixar quebrado" na TASK-078 (Etapa 7).** Esta task não as reescreve: apenas
as isola atrás de um erro explícito, para que nenhuma delas finja funcionar.

**Critérios BDD**:
- [x] **Cenário**: O pool conecta pelo pooler em transaction mode
      Dado `DATABASE_URL` apontando para o pooler
      Quando o módulo é carregado
      Então a conexão é obtida de um pool com limite configurável
      E nenhuma consulta usa prepared statement **nomeado** (incompatível com transaction mode).
- [x] **Cenário**: A API de acesso a dados cobre os três formatos de uso do código atual
      Dado que hoje o código usa `.get()`, `.all()` e `.run()`
      Quando o módulo novo é usado
      Então `queryOne` devolve uma linha ou `undefined`, `query` devolve o array de linhas,
      e `execute` devolve o número de linhas afetadas
      E todos aceitam parâmetros vinculados, nunca interpolação.
- [x] **Cenário**: Parâmetro vinculado, sempre (constitution §1.3)
      Dado um valor com aspa simples vindo de input
      Quando ele é passado como parâmetro
      Então chega ao banco como dado, não como SQL
      E uma tentativa de montar SQL por concatenação é recusada pelo próprio formato da API.
- [x] **Cenário**: O banco de teste é Postgres real, com o schema da Etapa 3
      Dado o container de teste no ar
      Quando a suíte inicia
      Então as migrations de `db/migrations-pg/` são aplicadas
      E os triggers de imutabilidade da TASK-065 estão ativos no banco de teste.
- [x] **Cenário**: Docker parado dá mensagem acionável, não erro de conexão cru
      Dado que o daemon do Docker não está rodando
      Quando a suíte é executada
      Então a falha diz o que fazer (subir o container), em vez de `ECONNREFUSED`.
- [x] **Cenário**: Isolamento entre testes
      Dado que os testes compartilham um banco real
      Quando um teste grava dados
      Então o teste seguinte não os enxerga
      E a ordem de execução não altera o resultado.
- [x] **Cenário**: As rotas de backup por cópia de arquivo não fingem funcionar
      Dado `resetConnection` sem equivalente possível no Postgres
      Quando `backups/import` ou `backups/restore` é chamada
      Então a resposta é um erro explícito citando a TASK-078
      E nenhuma delas altera estado.

---

## TASK-069: Conversão das consultas para assíncronas

**Contexto**: 162 chamadas em 28 arquivos, incluindo os 4 Server Components. Duas conversões
mecânicas e uma de julgamento. Mecânicas: `?` → `$n` (com a numeração acompanhando a ordem
de `push` nos dois pontos que montam condição dinamicamente — `history-query.ts` e
`logs/route.ts`) e `.get/.all/.run` → `await`. De julgamento: as 15 comparações de booleano
com `0`/`1`, que no Postgres passam a ser **erro de tipo** — o que é ganho, porque falha alto
em vez de nunca casar em silêncio.

Oráculo completo, levantado na TASK-063: **`docs/migracao-dialeto-sql.md`**.

Entregue em 5 fatias (ver D4), cada uma com par test→feat próprio e a suíte inteira verde ao
fim. Não há BDD por fatia: os critérios abaixo valem para **todas**, e a última fatia carrega
os que só podem ser verificados no fim.

**Critérios BDD**:
- [ ] **Cenário**: Nenhum marcador posicional do SQLite sobrevive
      Dado o código convertido
      Quando as consultas são inspecionadas
      Então não há `?` como marcador de parâmetro
      E toda consulta usa `$n`, com a numeração batendo com a ordem dos valores.
- [ ] **Cenário**: Comparação de booleano deixa de usar 0/1
      Dado que `users.active`, `users.requires_password_change`, `keys.active` e
      `login_attempts.success` são `boolean` no Postgres (TASK-063)
      Quando as 15 ocorrências são convertidas
      Então nenhuma compara a coluna com `0` ou `1`.
- [ ] **Cenário**: Os 4 fluxos críticos continuam funcionando (spec §4)
      Dado login, retirada, confirmação e devolução
      Quando cada um é exercido pela suíte contra o Postgres de teste
      Então o comportamento é idêntico ao de antes da conversão
      E nenhum teste existente precisou ter a expectativa afrouxada para passar.
- [ ] **Cenário**: `strftime` do filtro de hora vira extração com fuso explícito
      Dado que a TASK-055 prendeu a exibição a `America/Recife`
      Quando o filtro de hora é convertido em `history-query.ts` e `logs/route.ts`
      Então a hora é extraída **convertendo o fuso**, não do valor cru em UTC
      E o defeito que a TASK-055 corrigiu não volta por outro caminho.
- [ ] **Cenário**: Os Server Components consultam de forma assíncrona
      Dado que os 4 consultam o banco durante o render
      Quando são convertidos
      Então cada um aguarda a consulta antes de renderizar
      E a página continua sendo renderizada no servidor, sem virar client component.
- [ ] **Cenário**: `src/lib/db.ts` deixa de existir e `better-sqlite3` sai do runtime
      Dado que todas as fatias fecharam
      Quando o código-fonte é inspecionado
      Então nenhum arquivo de `src/` importa `better-sqlite3` nem `@/lib/db`
      E `better-sqlite3` passa a devDependency, porque `db/migrate.mjs` e `db/load-pg.mjs`
      ainda precisam dele (D3).

---

## TASK-070: Transações explícitas com client dedicado

**Contexto**: `db.transaction(() => ...)` do better-sqlite3 é síncrono e não tem equivalente
direto: no Postgres a transação vive num **client dedicado** tirado do pool, com
`BEGIN`/`COMMIT`/`ROLLBACK` explícitos. Usar o pool solto quebraria a garantia — cada
consulta poderia sair por uma conexão diferente.

Três usos: `settings/route.ts` (gravação de configurações), `[id]/user-confirm/route.ts` (o
fecho da dupla confirmação — o mais crítico do sistema) e `db-maintenance.ts` (o bypass da
imutabilidade, que na TASK-065 virou `set_config(..., is_local = true)` e por isso **depende**
de estar dentro de uma transação de verdade).

**Critérios BDD**:
- [ ] **Cenário**: A transação usa um único client, do começo ao fim
      Dado um bloco transacional
      Quando várias consultas são executadas dentro dele
      Então todas passam pelo mesmo client
      E o client volta ao pool ao final, inclusive quando há erro.
- [ ] **Cenário**: Erro no meio reverte tudo
      Dado a confirmação de uma retirada, que grava em `key_transactions`, `keys` e `history`
      Quando a última gravação falha
      Então nenhuma das anteriores persiste.
- [ ] **Cenário**: O bypass de manutenção só vale dentro da transação
      Dado `withMaintenanceMode`
      Quando ele executa um `DELETE` em `history`
      Então o `DELETE` é permitido
      E, encerrada a transação, um novo `DELETE` volta a ser rejeitado pelo trigger
      E nada precisou ser limpo explicitamente (TASK-065).
- [ ] **Cenário**: Vazamento de conexão é detectável
      Dado a suíte inteira executada
      Quando ela termina
      Então o pool não tem client em uso pendente.

---

## TASK-071: `bcrypt` → `bcryptjs`

**Contexto**: `bcrypt` é addon nativo — precisa compilar contra o Node do ambiente. Em
build serverless isso é fonte de falha por incompatibilidade de ABI e de binário ausente.
`bcryptjs` é implementação pura em JS, com a mesma API de `hash`/`compare` e **o mesmo
formato de hash**: os hashes já gravados continuam validando, sem reset de senha para
ninguém. Custo: é mais lento — aceitável para ~19 usuários e um login por vez.

6 arquivos, 5 chamadas de `hash` e 4 de `compare`.

**Critérios BDD**:
- [x] **Cenário**: Hash gerado pelo `bcrypt` antigo continua validando
      Dado um hash `$2b$` gerado pela implementação nativa
      Quando `bcryptjs.compare` é usado com a senha correta
      Então a comparação passa
      E ninguém precisa trocar de senha por causa da migração.
- [x] **Cenário**: Custo mínimo preservado (constitution §1.1)
      Dado a criação de uma senha nova
      Quando o hash é gerado
      Então o custo é ≥ 10.
- [x] **Cenário**: Nenhum addon nativo sobra na árvore de runtime
      Dado o `package.json`
      Quando as dependências são inspecionadas
      Então `bcrypt` e `@types/bcrypt` não estão mais em `dependencies`.

---

## Fora do escopo desta sprint (registro explícito)

- **Realtime** no lugar dos 4 pollings — Sprint 22 (TASK-072/073). Esta sprint mantém os
  pollings exatamente como estão; só muda o que está atrás deles.
- **Logs estruturados em tabela** — Sprint 23.
- **`DATABASE_URL` de produção, rotação do `JWT_SECRET`, papel de menor privilégio e deploy**
  — Sprint 24. Esta sprint desenvolve e testa contra o container; a senha do banco do
  Supabase **não é necessária** e não deve ser pedida agora.
- **Reescrever o backup/restore por cópia de arquivo** — TASK-078 (Sprint 24). Aqui as duas
  rotas apenas param de fingir que funcionam.
- **`employees` / `employee_id` no `keys.db`** — as colunas órfãs seguem até a Etapa 7
  (decisão da TASK-066).
