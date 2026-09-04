# tasks.md — Micro-spec da Sprint Ativa (Sprint 20 · 🔴 crítica)

> **Etapa 3 do ADR-012 — Schema Postgres.** Primeira sprint que toca a stack.
> Entrega o schema no Supabase; **nenhuma linha de código da aplicação passa a falar
> Postgres nesta sprint** — isso é a Etapa 4 (Sprint 21). O `keys.db` permanece a
> fonte vigente e íntegra (plano de reversão do ADR-012, item 2).
>
> Canal recomendado: Claude Code · Modelo: Opus 5 · Esforço: alto.
> Criticidade 🔴: mexe em imutabilidade de trilha de auditoria (constitution §4.4) e
> move PII para provedor terceiro (constitution §0).
>
> **Projeto Supabase:** `nkhoyvgnevtwlkheknxu` · região `sa-east-1` (São Paulo) ·
> schema `public` vazio na abertura da sprint (verificado em 2026-09-03).

---

## Decisões de execução — **aprovadas pelo usuário em 2026-09-03**

**D1 — ✅ APROVADA (opção recomendada).** `db/migrations-pg/` + Gate 2 estendido.
**D2 — ✅ Vigente.** Teste estrutural em Vitest + prova empírica via MCP no Report.
**D3 — ✅ APROVADA (opção recomendada).** Carga da TASK-067 com dados **sintéticos**;
a carga de PII real fica para a Etapa 7, junto da ciência formal da direção.

---

**D1 — Onde vivem as migrations Postgres e como o Gate 2 as cobre.**
As migrations SQLite vivem em `db/migrations/` e são executadas por `db/migrate.mjs`
(better-sqlite3). SQL Postgres nesse diretório seria aplicado contra o `keys.db` pelo
runner — inaceitável. **Recomendação:** diretório irmão `db/migrations-pg/`, mesma
convenção `YYYYMMDDHHMM_descricao.up.sql` / `.down.sql`, e o Gate 2 passa a rodar
`scripts/check-migrations.mjs` nos **dois** diretórios.
⚠️ Isso exige editar `scripts/ci-gates.sh`, que está na **zona somente leitura** do
`00-core.md`. Precedente: a TASK-059 já o editou na Sprint 19 (commit `e4ad352`), com
a mesma natureza — corrigir o alcance do próprio gate, nunca afrouxá-lo. **Requer
autorização explícita do usuário.**

**D2 — Contra o que os testes desta sprint rodam.**
A decisão "banco dos testes" está registrada no `plan.md` para o início da Sprint 21, e
o driver Postgres só entra na TASK-068. Nesta sprint, portanto, o teste automatizado
**não conecta em banco**: ele valida os arquivos de migration estruturalmente (dialeto,
pareamento, presença de índice/trigger/REVOKE, ausência do legado). A prova empírica é
a aplicação real no projeto Supabase via MCP, com inspeção do catálogo (`list_tables`,
`information_schema`) registrada no Report do Step 9. Quando a Sprint 21 decidir o banco
de teste, estes testes viram comportamentais.

**D3 — Quando a PII real cruza para o provedor terceiro.**
A constitution §0 exige *"ciência formal da direção da instituição ANTES do go-live"*.
A TASK-067, como está no `plan.md`, carrega os dados reais (19 usuários com nome
completo, matrícula e telefone) para o Supabase agora — meses antes do go-live. **É
neste momento que a PII efetivamente sai do campus**, não no go-live.
Duas saídas: **(a)** obter a ciência formal da direção agora e carregar os dados reais;
**(b)** ensaiar a TASK-067 com dados sintéticos e deixar a carga real para a Etapa 7,
onde ela precisa acontecer de novo de qualquer forma (o `keys.db` de produção continua
recebendo escritas até a virada). **Recomendação: (b)** — o valor técnico da TASK-067 é
provar o loader e a reconciliação de contagens, o que dados sintéticos provam
igualmente bem, sem antecipar a exposição de PII nem gerar uma cópia obsoleta.

---

## TASK-063: Schema Postgres equivalente (ADR-012 · Etapa 3)

**Contexto**: O schema de produção vive na baseline `202607021900_baseline.up.sql` mais
quatro migrations incrementais, todas em dialeto SQLite. O Postgres precisa do
equivalente com as conversões de dialeto mapeadas no ADR-012. Entrega **DDL**: as
conversões de *consulta* (`json_build_object`, `RETURNING id` no lugar de
`lastInsertRowid`, `ON CONFLICT DO NOTHING`) tocam código de aplicação e são da Sprint 21
— aqui elas entram como **tabela de mapeamento documentada**, que é o oráculo daquela
sprint.

Conversões de tipo aplicadas: `INTEGER PRIMARY KEY AUTOINCREMENT` → `integer GENERATED
ALWAYS AS IDENTITY PRIMARY KEY`; `BOOLEAN DEFAULT 1` / `INTEGER DEFAULT 1` usados como
booleano (`users.active`, `users.requires_password_change`, `keys.active`,
`login_attempts.success`) → `boolean` real; `DATETIME DEFAULT CURRENT_TIMESTAMP` →
`timestamptz DEFAULT now()`; `rate_limit_hits.hit_at` permanece **inteiro de 64 bits**
(epoch em ms — a TASK-054 já o escolheu por ser comparável nos dois dialetos).

**Critérios BDD**:
- [x] **Cenário**: Par UP/DOWN existe antes de qualquer aplicação
      Dado o diretório de migrations Postgres definido em D1
      Quando a migration de baseline é criada
      Então o arquivo `.down.sql` existe **antes** de o `.up.sql` ser aplicado em qualquer banco
      E `node scripts/check-migrations.mjs <dir>` sai com código 0.
- [x] **Cenário**: Nenhum resíduo de dialeto SQLite no UP
      Dado o UP de baseline Postgres
      Quando ele é inspecionado pelo teste
      Então não contém `AUTOINCREMENT`, `DATETIME`, `INTEGER PRIMARY KEY` nem `RAISE(ABORT`
      E toda coluna de instante é `timestamptz`
      E toda chave primária de tabela nova é `GENERATED ALWAYS AS IDENTITY`.
- [x] **Cenário**: Colunas booleanas deixam de ser inteiros
      Dado que `users.active`, `users.requires_password_change`, `keys.active` e
      `login_attempts.success` guardam 0/1 no SQLite
      Quando o schema Postgres é criado
      Então as quatro são `boolean`, com `DEFAULT true` onde o SQLite tinha `DEFAULT 1`.
- [x] **Cenário**: Aplicação real no Supabase
      Dado o projeto `nkhoyvgnevtwlkheknxu` com `public` vazio
      Quando o UP é aplicado
      Então `list_tables` retorna as 9 tabelas de negócio (`users`, `keys`,
      `key_transactions`, `history`, `action_logs`, `audit_logs`, `login_attempts`,
      `settings`, `rate_limit_hits`)
      E as chaves estrangeiras equivalentes às do `keys.db` estão declaradas.
- [x] **Cenário**: DOWN devolve o schema ao estado anterior
      Dado o UP aplicado
      Quando o DOWN é aplicado
      Então `public` volta a não ter nenhuma das tabelas criadas pelo UP.
- [x] **Cenário**: Mapeamento de dialeto fica registrado para a Sprint 21
      Dado que `json_build_object`, `RETURNING id` e `ON CONFLICT DO NOTHING` são
      conversões de consulta, não de schema
      Quando a task fecha
      Então a tabela de mapeamento SQLite→Postgres está versionada em
      `docs/migracao-dialeto-sql.md`, citando os pontos do código que cada linha atinge.

---

## TASK-064: Índices (ADR-012 · Etapa 3)

**Contexto**: O schema atual **não declara um único índice** fora do
`idx_rate_limit_hits_lookup` (TASK-054). Em SQLite, com 5 chaves e ~130 linhas de
histórico na mesma máquina, isso não aparecia; sob rede, cada varredura completa vira
latência. Os filtros já foram tornados sargáveis na TASK-055 (faixa `[início, fim)` em
vez de função sobre a coluna), então os índices de data são efetivamente usáveis.

**Critérios BDD**:
- [x] **Cenário**: Índices mínimos do ADR-012 declarados
      Dado o schema Postgres criado
      Quando os índices são inspecionados em `pg_indexes`
      Então existem `history(timestamp DESC)`, `history(key_id)`, `history(user_id)`,
      `action_logs(timestamp DESC)`, `key_transactions(key_id, status)` e
      `key_transactions(user_id)`
      E `rate_limit_hits(scope, identifier, hit_at)` foi preservado da TASK-054.
- [x] **Cenário**: O índice de data é de fato usado pela consulta do histórico
      Dado o filtro de faixa que `src/lib/history-query.ts` monta (TASK-056)
      Quando `EXPLAIN` é executado sobre a consulta equivalente no Postgres
      Então a faixa aparece como **`Index Cond` em `idx_history_timestamp`**
      E a forma não-sargável equivalente (função sobre a coluna, como era antes da
      TASK-055) aparece como `Filter`, sem `Index Cond`.

      > **Critério corrigido durante a execução.** A redação original era *"o plano
      > usa varredura por índice, não `Seq Scan`"* — e estava errada. Com ~130 linhas
      > o planejador prefere `Seq Scan` e está **certo** em preferir; forçar o
      > contrário com `enable_seqscan = off` e declarar vitória não provaria nada
      > sobre o índice. O que importa medir é se o predicado alcança o índice, e isso
      > se lê em `Index Cond` (restringe o que é lido) versus `Filter` (lê tudo e
      > descarta depois). É exatamente a diferença que a TASK-055 comprou ao trocar
      > função-sobre-coluna por faixa `[início, fim)`.
- [x] **Cenário**: DOWN pareado remove exatamente os índices criados
      Dado o UP de índices aplicado
      Quando o DOWN é aplicado
      Então nenhum dos índices criados por este UP permanece, e nenhum outro é removido.

---

## TASK-065: Imutabilidade do histórico + fechamento de escrita (constitution §4.4)

**Contexto**: No SQLite a imutabilidade é dois triggers com `RAISE(ABORT)` guardados por
uma tabela-flag `_maintenance_mode`, criada e removida na mesma transação
(`src/lib/db-maintenance.ts`). No Postgres o bypass vira `set_config('app.maintenance_mode',
'on', true)` — escopo **transacional por construção**, o que dispensa a tabela-flag e
elimina a janela em que a flag existe fora de uma transação.

**Adição ao texto do ADR-012, dentro do mesmo assunto (quem pode escrever):** o Supabase
expõe as tabelas de `public` pela API de dados (PostgREST) com a chave anônima. A
autorização deste sistema é sessão própria verificada server-side (constitution §3.2);
tabela alcançável pela chave anônima passaria ao largo dela inteira. Fechar isso é parte
de "quem pode escrever no banco" e não pode ficar para depois — o projeto já está de pé
na internet.

**Critérios BDD**:
- [ ] **Cenário**: UPDATE em `history` é rejeitado
      Dado um registro em `history`
      Quando um `UPDATE` é executado fora do modo manutenção
      Então a transação é abortada com exceção citando REQ-005
      E o registro permanece idêntico.
- [ ] **Cenário**: DELETE em `history` é rejeitado
      Dado um registro em `history`
      Quando um `DELETE` é executado fora do modo manutenção
      Então a transação é abortada com exceção citando REQ-005 e o fluxo ADMIN do REQ-014.
- [ ] **Cenário**: O bypass de manutenção funciona e não sobrevive à transação
      Dado `set_config('app.maintenance_mode', 'on', true)` dentro de uma transação
      Quando um `DELETE` em `history` é executado na mesma transação
      Então ele é permitido
      E, encerrada a transação, um novo `DELETE` volta a ser rejeitado sem qualquer
      limpeza explícita de estado.
- [ ] **Cenário**: `REVOKE` como defesa em profundidade
      Dado o schema aplicado
      Quando as permissões de `history` são inspecionadas
      Então `UPDATE` e `DELETE` estão revogados de `PUBLIC`, `anon` e `authenticated`
      E a nota de que o papel de aplicação com menor privilégio é entregue na Etapa 7
      (TASK-077) está registrada no cabeçalho da migration.
- [ ] **Cenário**: Nenhuma tabela é alcançável pela chave anônima
      Dado que a autorização do sistema é sessão própria verificada no servidor (§3.2)
      Quando o acesso pela API de dados do Supabase é verificado
      Então nenhuma das 9 tabelas responde a leitura ou escrita com a chave anônima
      E `get_advisors(security)` não reporta tabela exposta sem proteção.
- [ ] **Cenário**: DOWN pareado
      Dado o UP aplicado
      Quando o DOWN é aplicado
      Então triggers, função e GRANTs voltam ao estado anterior ao UP.

---

## TASK-066: Consolidação do legado `employees` / `employee_id`

**Contexto**: Levantamento no backup de produção mais recente
(`backups/keys_backup_2026-07-06.db`): `employees` tem **0 linhas**;
`keys.employee_id` é NULL em **5/5** linhas; `history.employee_id` é NULL em **30/30**.
Mesmo assim `src/lib/history-query.ts:53` ainda faz `LEFT JOIN employees`, `keys` carrega
`employee_id` e `user_id` convivendo, `transactions/route.ts:27` mantém um fallback
`employee_id` → `user_id`, e `clear-database/route.ts:17` lista `employees` em
`tablesToClear`. É código morto que só existe porque nunca foi decidido. Carregar dados
para o Postgres sem decidir isso perpetua o legado na stack nova.

**Decisão a registrar**: `employees` e as colunas `employee_id` são **descartadas** — o
portador de uma chave é `users.id`, ponto. Contagem zero em produção torna a decisão
sem custo de dados.

**Escopo do descarte**: o schema Postgres simplesmente **não tem** `employees` nem
`employee_id`, e o código morto sai agora (é neutro em dialeto). **O `keys.db` não recebe
migration de DROP** — as colunas ficam órfãs e inertes até o SQLite ser aposentado na
Etapa 7. Motivo: preservar o plano de reversão do ADR-012, que depende de `git revert`
devolver um sistema funcional; um DROP em SQLite é a única parte que um revert não desfaz.

**Critérios BDD**:
- [ ] **Cenário**: A consulta do histórico deixa de tocar `employees`
      Dado `src/lib/history-query.ts`
      Quando a consulta é montada
      Então não há `LEFT JOIN employees`
      E os testes de `tests/history-query.test.ts` continuam passando sem alteração de expectativa.
- [ ] **Cenário**: O fallback de `employee_id` sai da criação de transação
      Dado um POST em `/api/transactions` sem `user_id` e com `employee_id`
      Quando a requisição é processada
      Então ela é rejeitada pela validação Zod, como qualquer requisição sem portador
      E nenhum caminho do código resolve portador a partir de `employee_id`.
- [ ] **Cenário**: `employees` sai da limpeza destrutiva
      Dado `clear-database/route.ts`
      Quando `tablesToClear` é inspecionada
      Então `employees` não está na lista
      E os testes de `tests/destructive-trail.test.ts` continuam passando.
- [ ] **Cenário**: O schema Postgres nasce sem o legado
      Dado o schema aplicado no Supabase
      Quando `list_tables` e as colunas de `keys` e `history` são inspecionadas
      Então não existe tabela `employees` nem coluna `employee_id` em nenhuma tabela.
- [ ] **Cenário**: O `keys.db` não é alterado
      Dado que nenhuma migration SQLite é adicionada por esta task
      Quando `db/migrations/` é inspecionado
      Então ele permanece com os 5 pares existentes.

---

## TASK-067: Carga de dados para o Postgres, com reconciliação de contagens

**Contexto**: Cópia, **não** movimentação — o `keys.db` permanece íntegro (plano de
reversão do ADR-012, item 2). O objetivo desta task é provar o loader e a reconciliação,
não fazer a virada: o `keys.db` de produção continua recebendo escritas até a Etapa 7,
então a carga definitiva acontece lá de novo, obrigatoriamente.

Depende de **D3**. Sob a recomendação (b), a fonte desta sprint é um conjunto sintético
com a mesma forma e volume do backup (19 usuários, 5 chaves, 92 transações, 30 linhas de
histórico, 99 logs de ação, 4 settings) e nenhum dado pessoal real.

O loader não usa driver Postgres (a conexão é a TASK-068, Sprint 21): lê o SQLite e emite
SQL de carga, aplicado via MCP do Supabase. Como o SQL é **gerado**, e não parametrizado,
a montagem dos literais é isolada em uma função com teste próprio — a fonte é arquivo
local confiável, não input externo, o que a coloca fora do alcance de §1.3, mas a
qualidade do escape precisa ser provada mesmo assim.

**Critérios BDD**:
- [ ] **Cenário**: Escape de literais é correto e recusa o que não sabe tratar
      Dado um valor com aspa simples, barra invertida, quebra de linha, `NULL`, booleano e número
      Quando o gerador o converte em literal SQL
      Então o valor sobrevive intacto ao ir e voltar do banco
      E qualquer tipo fora dessa lista faz o gerador lançar, nunca emitir SQL adivinhado.
- [ ] **Cenário**: Contagem por tabela reconcilia
      Dado o banco de origem
      Quando a carga termina
      Então `COUNT(*)` no Postgres é igual ao do SQLite **para cada uma das 9 tabelas**
      E a divergência em qualquer tabela aborta a carga com relatório por tabela.
- [ ] **Cenário**: Sequências de IDENTITY ficam à frente dos IDs carregados
      Dado que os IDs de origem são preservados na carga
      Quando um novo registro é inserido depois da carga
      Então ele recebe um ID livre, sem colidir com nenhum carregado.
- [ ] **Cenário**: Instantes chegam íntegros
      Dado que `history.timestamp` foi normalizado para ISO com `Z` na TASK-055
      Quando as linhas são carregadas em `timestamptz`
      Então o instante lido de volta é igual ao de origem
      E nenhuma linha desloca por interpretação de fuso.
- [ ] **Cenário**: A carga não escreve no histórico por caminho proibido
      Dado que `history` tem trigger de imutabilidade (TASK-065)
      Quando as linhas de histórico são inseridas
      Então o `INSERT` é permitido normalmente, sem uso do modo manutenção
      (o trigger cobre UPDATE e DELETE, nunca INSERT).
- [ ] **Cenário**: A origem permanece intacta
      Dado o arquivo SQLite de origem
      Quando a carga termina
      Então o arquivo tem o mesmo conteúdo de antes (aberto somente-leitura)
      E `PRAGMA integrity_check` retorna `ok`.
- [ ] **Cenário**: A carga é repetível
      Dado que a carga definitiva acontecerá de novo na Etapa 7
      Quando o loader é executado sobre um Postgres já carregado
      Então ele falha de forma explícita ou trunca e recarrega sob flag, nunca duplica em silêncio.

---

## Fora do escopo desta sprint (registro explícito)

- Qualquer código de aplicação passar a consultar Postgres — Etapa 4 / Sprint 21.
- Driver, pooler e `DATABASE_URL` no `.env` — TASK-068 (Sprint 21).
- Papel de aplicação com menor privilégio e rotação do `JWT_SECRET` — TASK-076/077 (Sprint 24).
- Migration de DROP no `keys.db` — só após a Etapa 7, por reversibilidade (ver TASK-066).
- Pendência de deploy herdada: `node db/migrate.mjs up` no `keys.db` de produção
  (migrations `202609021700` e `202609021800`) — ação de operação, não desta sprint.
