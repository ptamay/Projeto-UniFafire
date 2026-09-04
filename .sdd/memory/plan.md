# plan.md — Como & Roadmap (UniFafire · Sistema de Gerenciamento de Chaves)

> Perspectiva de engenharia. Gerado na Fase 6. Toda mudança de escopo passa antes
> pelo Changelog do `spec.md`. Decisões não-óbvias registradas na §2.

## 1. Stack Aprovada

> A tabela nasceu na Fase 5 descrevendo o legado mantido como baseline. O **ADR-012**
> (aprovado em 2026-09-02) a substitui por etapas; a coluna "Observação" registra em que
> ponto cada camada está. Camada já virada = a linha vale como está. Camada ainda em
> transição = o legado continua vigente até a Etapa 7 (constitution §0).

| Camada | Tecnologia | Observação |
|---|---|---|
| Full-stack | Next.js (App Router) + React 19 + TypeScript | já em produção local |
| Banco | **Postgres (Supabase, `sa-east-1`) via `pg`** — ver D-09 | ✅ virado na Sprint 21 (Etapa 4). `src/lib/db.ts` apagado; nada em `src/` importa `better-sqlite3`, que virou devDependency das ferramentas offline (`db/migrate.mjs`, `db/load-pg.mjs`). Parâmetro vinculado `$n` obrigatório; **sem prepared statement nomeado** (transaction mode) |
| Auth | JWT (`jose`, HS256) em cookie + **`bcryptjs`** — ver D-10 | ✅ segredo em `.env` desde a Sprint 1; addon nativo trocado na Sprint 21 (TASK-071), mesmo formato de hash |
| Validação | Zod (`src/lib/schemas.ts`) | fonte única de schemas e RBAC |
| Jobs | ~~node-cron (`src/lib/backup.ts`)~~ | ⛔ **neutralizado na Sprint 21** — processo de longa duração não existe em execução serverless. Substituto é da **TASK-078** (Etapa 7), que é bloqueante para o go-live |
| UI | CSS nativo estruturado + tokens do `ui-context.md` + react-hot-toast | sem migração para shadcn — ver D-03 |
| Hospedagem | **Vercel** (ADR-012) | ⏳ Etapa 7b (Sprint 23). O aparato local (PM2, `.bat`, `ecosystem.config.js`, `show-ip.js`, `/api/server-info`) sai na TASK-079 **sem janela de retenção** — não existe servidor PM2 a manter ligado (Achados de 2026-09-04) |
| Testes | Vitest (unit/integração, **contra Postgres real em container** — ver D-11) + Playwright (E2E smoke) | ✅ container na Sprint 21: `npm run test:db:up`. `globalSetup` reproduz a baseline da plataforma Supabase e aplica `db/migrations-pg/` |
| Qualidade | ESLint + `npm audit` (gate de release) | Semgrep opcional |

## 2. Decisões e Justificativas

| Decisão | Alternativa descartada | Motivo da escolha |
|---|---|---|
| D-01: Manter SQLite/better-sqlite3 | PostgreSQL via Supabase (stack padrão PME) | Sistema single-instance em intranet, sem SaaS/multi-tenant; volume baixo; zero dependência de internet; migração adicionaria risco sem benefício |
| D-02: Manter PM2 em servidor local | Vercel + Railway | Requisito do cliente: rodar na rede interna, sem exposição externa; operação já dominada pela equipe |
| D-03: Manter CSS nativo estruturado do legado | Reescrever UI em shadcn/ui + Tailwind | `ui-context.md` já extraiu tokens do legado; reescrita visual é retrabalho sem valor de negócio na fase de estabilização |
| D-04: Segredo JWT em `.env` local | Doppler (default do framework) | Servidor sem dependência de serviço externo; um único secret; `.env` fora do git atende o risco real |
| D-05: Rate limit/lockout em memória | Upstash Redis | Instância única (PM2, 1 processo) — estado em memória é correto e suficiente; Redis adicionaria infra sem ganho |
| D-06: Estabilizar antes de criar features | Entregar features novas direto | Sistema "vibecodado": sessão sem expiração, senha fraca e ausência de testes são riscos ativos; baseline segura primeiro (handoff §Pontos de Atenção) |
| D-07: Migrações SQL manuais pareadas UP/DOWN em `db/migrations/` | Prisma Migrate | better-sqlite3 sem ORM no legado; introduzir Prisma agora = reescrita da camada de dados inteira; pareamento manual + teste em cópia do banco cumpre a constitution §4 |
| D-08: Vitest para testes | Jest | Suporte nativo a TS/ESM no Next.js moderno, execução mais rápida, menos configuração |
| D-09: `pg` (node-postgres) como driver | `postgres` (porsager); `@supabase/supabase-js` | Driver de referência do Postgres em Node e o que a documentação do Supabase assume. Funciona com o pooler em **transaction mode**, exigido por execução serverless. `postgres` é mais leve mas sua API de template tags esconde onde o parâmetro entra — o oposto do que se quer sob §1.3. `supabase-js` fala PostgREST, e a TASK-065 revogou `anon`/`authenticated` de propósito: a autorização deste sistema é a sessão da §3.2, não o JWT do Supabase. ⚠️ Transaction mode não suporta prepared statement **nomeado** — toda consulta usa `query(texto, valores)` sem `name`. Isso não afrouxa §1.3: `$n` é parâmetro vinculado. (Sprint 21 · TASK-068) |
| D-10: `bcryptjs` no lugar de `bcrypt` | Manter o addon nativo | Addon nativo compila contra o Node do ambiente — em build serverless, falha por ABI incompatível ou binário ausente. Mesmo formato de hash: os hashes gravados continuam validando, sem reset de senha. Custo: mais lento, irrelevante para ~19 usuários. (Sprint 21 · TASK-071) |
| D-11: Postgres real em container para os testes | SQLite em memória (duplo dialeto); schema de teste no próprio Supabase | Decisão pendente das Etapas 3–7, resolvida pelo usuário em 2026-09-03 conforme a recomendação do ADR-012. Testar contra dialeto diferente do de produção anularia a garantia justamente na sprint que reescreve 162 chamadas, e não exercitaria os triggers PL/pgSQL nem o `set_config` da TASK-065. Schema no Supabase dependeria de rede a cada execução e compartilharia o projeto com os dados carregados. (Sprint 21 · TASK-068) |

## 3. Roadmap — 6 Sprints de Estabilização

> Formato: TASK-NNN → REQ vinculado. Critérios BDD detalhados serão gerados no
> `tasks-[sprint].md` (Fase 9). Fluxo TDD: red → green → refactor.

> ⚠️ **Reconciliação 2026-07-02 (ADR-002):** as Sprints 4–6 abaixo **não foram executadas
> conforme planejado**. O agente de sprint entregou escopo diferente, sem Change Request
> (registrado retroativamente como REQ-017–020 no spec.md v1.2), reutilizando os números
> TASK-013–021 com outro significado nos `tasks-sprint-4/5/6.md`. As tasks planejadas e
> não entregues foram reagrupadas na **Sprint 7 — Dívida de Estabilização** (§4).
> A numeração canônica de tasks é a deste arquivo; trabalho novo começa em TASK-029.

### Sprint 1 — Segurança de Sessão e Credenciais (crítica)
- TASK-001 → REQ-011: `JWT_SECRET` persistente via `.env` + `.env.example`; falha explícita no boot se ausente em produção.
- TASK-002 → REQ-011: expiração de sessão (7d absoluta, 24h idle) + cookie `httpOnly`/`sameSite`.
- TASK-003 → REQ-012: política de senha 8+ em criação/troca/reset (Zod).
- TASK-004 → REQ-012: lockout 5 tentativas/15 min (conta + IP) e rate limit 30 req/min em `/api/auth/*`, dirigidos por `security-profile.ts`.
- TASK-005 → REQ-001: login não revela existência de usuário (mensagem única) — verificação + teste.

### Sprint 2 — Identidade de Sessão e Conta
- TASK-006 → REQ-013: identidade de sessão no shell (nome + papel + menu do usuário) conforme `ui-context.md`.
- TASK-007 → REQ-013: rota `/account/profile` (editar dados próprios).
- TASK-008 → REQ-013: rota `/account/security` (trocar senha; logout everywhere ao trocar).

### Sprint 3 — Rede de Testes (gate para tudo que vem depois)
- TASK-009 → REQ-015: setup Vitest + banco SQLite efêmero de teste + seeds (1 usuário por papel — constitution §strict seed).
- TASK-010 → REQ-015: testes de integração de auth (login, lockout, sessão expirada).
- TASK-011 → REQ-015: testes do ciclo retirada → confirmação → devolução (REQ-003/004) incluindo cancelamento.
- TASK-012 → REQ-015, REQ-002, REQ-007, REQ-008: testes de RBAC por rota (matriz papel × endpoint, cobrindo keys, users, settings, history, logs e backups).

### Sprint 4 — Hardening de Operações Destrutivas e RBAC
- TASK-013 → REQ-014: `history/clear` e `clear-database` restritos a ADMIN + log de auditoria prévio + modal destrutivo na UI; atualizar `threat_model_stride.md`.
- TASK-014 → REQ-010: revisão de cobertura do log de auditoria (toda ação administrativa gera entrada; nenhum dado sensível logado).
- TASK-015 → REQ-002/007: varredura de todas as rotas de API confirmando validação de sessão + permissão server-side (matriz da TASK-012 como oráculo).

### Sprint 5 — Dados, Migrações e DR
- TASK-016 → REQ-009: estrutura `db/migrations/` UP/DOWN pareados + script de aplicação com teste em cópia do banco.
- TASK-017 → REQ-009: verificação automática do backup diário (métrica "confiabilidade do backup" logada) + teste de restauração documentado.
- TASK-018 → REQ-005: constraint/verificação de imutabilidade do histórico no nível do banco (sem UPDATE/DELETE de transação fora do fluxo ADMIN do REQ-014).

### Sprint 6 — Observabilidade e Fechamento da Baseline
- TASK-019 → §7 constitution: logger estruturado com máscara de dados sensíveis + severidades; tempo de resposta das rotas críticas.
- TASK-020 → §5 spec: métricas de negócio no dashboard (taxa de dupla confirmação, chaves em atraso, tempo de balcão).
- TASK-021 → REQ-006: alerta visual de chaves em atraso (> 12h) no dashboard.
- TASK-022: runbook de operação (`docs/runbook.md`): iniciar/parar PM2, restaurar backup, RPO/RTO, responsável.

## 4. Backlog — Próximas Sprints

### Sprint 7 — Dívida de Estabilização (reconciliação ADR-002 — EXECUTAR ANTES do mobile)
> Tasks planejadas nas Sprints 4–6 originais e não entregues. Prioridade máxima: contém
> violações ativas de constitution. Detalhamento BDD em `docs/tasks-sprint-7.md`.
- TASK-029 → REQ-009 (ex-TASK-016): estrutura `db/migrations/` UP/DOWN pareados + script de aplicação com teste em cópia do banco; migrações legadas de `scripts/` documentadas como baseline.
- TASK-030 → REQ-005 (ex-TASK-018): imutabilidade do histórico no nível do banco (triggers), com bypass explícito e documentado apenas para o fluxo ADMIN do REQ-014.
- TASK-031 → REQ-014 (ex-TASK-013 parcial): registro prévio e persistente da operação `clear-database` (hoje apaga a trilha de auditoria sem logar nada) + criar `docs/threat_model_stride.md`.
- TASK-032 → REQ-009 (ex-TASK-017): verificação automática do backup diário — métrica "confiabilidade do backup" logada e consultável.
- TASK-033 → §7 constitution (ex-TASK-019): logger estruturado com severidades + máscara de dados sensíveis + tempo de resposta das rotas críticas.
- TASK-034 → REQ-006 / spec §5 (ex-TASK-020/021): métricas de negócio no dashboard (taxa de dupla confirmação, tempo de balcão) + alinhar threshold de atraso ao spec (12h; hoje 4h hardcoded).
- TASK-035 → REQ-015: reativar os 4 testes desativados (`src/lib/*.test.old`) adaptando à arquitetura atual.
- TASK-036 → DR / constitution §4 (ex-TASK-022): `docs/runbook.md` — PM2, restauração de backup testada e documentada, RPO 24h/RTO 4h, responsável.

### Sprint 8 — Responsividade Mobile (CR 2026-07-02, Tipo C — REQ-016, ADR-001; ex-Sprint 7)
> Tasks tipo Refactor. Implementação dentro do CSS nativo (D-03 mantida), tokens do
> `ui-context.md`. Detalhamento BDD em `docs/tasks-sprint-8.md`. Alvo: funcional a partir de 360px.
- TASK-023 → REQ-016: layout base responsivo — breakpoints documentados em `globals.css`, shell/navegação mobile (menu do usuário e navegação colapsáveis em telas pequenas).
- TASK-024 → REQ-016: `/login` e `/confirm` mobile-first — fluxo do portador (funcionário/aluno) no celular; alvos de toque ≥ 44px.
- TASK-025 → REQ-016: dashboard (`/`) — cards de chaves emprestadas/disponíveis, pendências e alertas adaptados a telas pequenas.
- TASK-026 → REQ-016: telas de listagem (`/history`, `/logs`, `/users`, `/keys`) — padrão tabela→card em viewport estreito, mantendo filtros e ações.
- TASK-027 → REQ-016: formulários e modais (`/settings`, `/account/profile`, `/account/security`, modais de confirmação destrutiva) adaptados a touch.
- TASK-028 → REQ-015/016: E2E smoke Playwright dos 4 fluxos críticos (spec §4) com viewport mobile 375×812, somado ao viewport desktop.

### Sprint 10 ✅ — Transferência de Chaves e Consolidação de Logs (CR 2026-07-06, Tipo C)
- ~~TASK-037 → REQ-022: Criar endpoint e interface para transferência direta de chave emprestada (com observação opcional).~~
- ~~TASK-038 → REQ-022: Adaptar queries de `/history` para refletir e exibir eventos de transferência de chaves corretamente.~~
- ~~TASK-039 → REQ-023: Refatorar página `/logs` consolidando as abas redundantes em uma visão unificada.~~
- ~~TASK-040 → REQ-024: Adaptar API e frontend para permitir transferência iniciada por usuário comum (requer dupla confirmação entre o remetente e o destinatário).~~
- ~~TASK-041 → REQ-025: Ajustar API e UI (`/confirm`, Dashboard) para que o remetente (initiator) visualize e possa cancelar transferências pendentes.~~

### Sprint 11 🏃‍♂️ — UI/UX Mobile (CR 2026-07-06, Tipo C)
- ~~TASK-042: Transferência no Mobile (REQ-026)~~
      *Adaptar a view de cards (mobile) no DashboardClient para incluir o botão/ação de Transferir chaves.*

### Sprint 12 ✅ — Solicitação de Chave em Uso (CR 2026-07-06, Tipo C — REQ-027, ADR-008)
> Fluxo "pull": não-portador solicita a chave diretamente ao portador. Reutiliza a máquina
> de `transfer` (papéis invertidos) — sem migration. Detalhes de modelagem no ADR-008.
- ~~TASK-043 → REQ-027: API — criação da solicitação (transfer com `user_id` = solicitante já confirmado e `porteiro_id` = portador pendente) + `user-confirm` aceitando a contraparte por `tx.porteiro_id === session.id` (autorização estrita, com teste de regressão).~~
- ~~TASK-044 → REQ-027: UI — ação "Solicitar esta chave" no card mobile e na linha desktop para não-portadores; estado "já solicitada"; aceite/recusa pelo portador em `/confirm` com texto contextual.~~
- ~~TASK-045 → REQ-027: e2e smoke desktop/mobile.~~ *Consolidada na TASK-044: o `tests/e2e/pull-flow.spec.ts` (test-first) roda nos dois viewports via projects do Playwright, cumprindo o smoke. Os testes unitários do fluxo pull vivem em `tests/transactions.test.ts` (TASK-043).*

### Sprint 13 ✅ — Devolução Forçada Ampla e Clareza Mobile (CR 2026-07-07, Tipo C — REQ-028, ADR-009)
> Mudança em feature entregue (mobile/bypass). Sem migration (coluna `justification` já existe).
> Aproveita o WIP de responsividade CSS-driven (`.mobile-only`/`.desktop-only`) já iniciado.
- ~~TASK-046 → REQ-028: API — devolução forçada de qualquer chave em uso por porteiro/admin, com justificativa obrigatória informada no ato (não herdada) e log de auditoria; test→feat.~~
- ~~TASK-047 → REQ-028: UI mobile — botão "Devolver" no card (portador/portaria) + campo de justificativa na devolução forçada + estados claros; consolida o refactor CSS-responsivo; `withdraw_justification`/`in_use_since` no SSR; test (e2e) → feat.~~

> **Achados fora de escopo (registrados, não corrigidos nesta sprint):**
> - `keys.db` está rastreado no git (viola constitution §4.5) — deveria ser `git rm --cached` + `.gitignore`.
> - ~~Visão porteiro/desktop do Dashboard gera scroll horizontal (viola REQ-016)~~ — **quitado (2026-07-08, branch claude/keen-yonath-349772):** causa real era o tooltip decorativo invisível vazando além da viewport + botões estourando a coluna de Ações; corrigido com `overflow-x: clip` + flex-wrap e coberto por e2e de regressão (`no-horizontal-scroll.spec.ts`).

### Sprint 14 ✅ — Fluxo Unificado do Dashboard (CR 2026-07-09, Tipo C — REQ-029, ADR-010)
> Mudança em features entregues (REQ-021, REQ-016 e UI de REQ-003/004). Sem migration.
> Origem: re-crítica UI/UX dual-agent (snapshots `.impeccable/critique/` de 2026-07-08/09).
> Somente UI + 1 query de métrica — endpoints de transação e máquina de dupla confirmação intocados.
- ~~TASK-048 → REQ-029a: campo único busca+ação no desktop — filtra a lista em tempo real e age no Enter; remove o input de busca duplicado; seletor por linha permanece como caminho de mouse. test (e2e teclado)→feat.~~
- ~~TASK-049 → REQ-029b: painel de pendências inline no topo do Dashboard, confirmar/cancelar reutilizando os endpoints de `/confirm` (pending/user-confirm/cancel); `/confirm` permanece como visão completa. test→feat.~~
- ~~TASK-050 → REQ-029c: `/api/metrics/frequent-keys` ramifica por papel (portaria = frequência global, comum = própria); UI mostra chips para o porteiro no mobile. test (vitest)→feat.~~
- ~~TASK-051 → REQ-029d: light mode integral — sidebar tematizada no modo claro (AA/AAA medido; fallback dark do ADR não foi necessário); login respeita o tema salvo; decisão documentada no DESIGN.md. test (e2e)→feat.~~

### Sprint 15 🏃‍♂️ — Melhorias de Dashboard UX (CR 2026-07-18, Tipo C — REQ-030, ADR-011)
- [x] TASK-052 → REQ-030: Reordenar as abas no `DashboardClient.tsx`. Definir "Minhas chaves" como primeira aba (e ativa por padrão) caso o usuário tenha esse acesso; seguida por "Disponíveis", "Em uso" e "Todas".

### Sprint 16 🏃‍♂️ — Correções Críticas Pré-Nuvem (Etapa 1 da migração Supabase/Vercel)
> Origem: análise de viabilidade da migração para Supabase + Vercel (2026-09-02).
> Defeitos que hoje não aparecem porque o sistema roda em rede local, e que se
> tornam bloqueadores ao publicar na internet. Executada ANTES da mudança de stack,
> de propósito: valem por si mesmas mesmo que a migração não avance.
- [x] TASK-053 → lockout por conta, não por endereço de rede. `checkLockout` contava falhas com `username = ? OR ip = ?` no mesmo limiar de 5; no NAT do campus todos compartilham um IP público e cinco erros de senha de uma pessoa trancariam todos por 15 min. Limiar separado por IP (50) preserva defesa contra varredura de usernames. `clearLoginAttempts` deixa de apagar por IP. test→fix.
- [x] TASK-054 → rate limit sai do `Map` em memória para a tabela `rate_limit_hits`. Em serverless cada instância tinha o seu contador, zerado a cada cold start. `hit_at` em epoch ms — comparável por faixa em SQLite e Postgres. Migration UP/DOWN pareada. test→fix.
- [x] TASK-055 → fuso na auditoria. Filtros de dia/mês/hora comparavam o valor cru em UTC contra a hora exibida ao operador; movimentações entre 21h e a meia-noite local caíam no dia seguinte. Passam a faixa `[início, fim)` UTC (também sargável, preparando a Etapa 3). Normaliza as 6 linhas de `history` gravadas no formato do `CURRENT_TIMESTAMP`, que o JavaScript lia como hora local e exibia 3h adiantadas. Exibição presa a `America/Recife` via `APP_TIMEZONE`. test→fix.

> **Ação de deploy pendente:** aplicar `node db/migrate.mjs up` no `keys.db` de produção
> (migrations `202609021700_rate_limit_hits` e `202609021800_normalize_history_timestamps`).
> A segunda foi validada em cópia do backup de 2026-07-06: 30/30 timestamps em ISO,
> triggers de imutabilidade intactos, `integrity_check` ok.

### Sprint 17 🏃‍♂️ — Filtros e Paginação do Histórico (Etapa 2 da migração)
> Maior ganho funcional do plano de migração e independente da mudança de stack:
> vale por si mesmo mesmo que as Etapas 3–7 não avancem.
- [x] TASK-056 → filtro por portador, chave e tipo de movimentação na trilha de auditoria. A tela só filtrava por data/mês/hora, deixando sem resposta "quem pegou a chave X?" e "o que o Fulano pegou?". Montagem da consulta extraída para `src/lib/history-query.ts` — testável contra o banco sem renderizar, e ponto único para a conversão assíncrona da Etapa 4. Ação validada contra vocabulário fechado; id não numérico descartado. test→feat.
- [x] TASK-057 → paginação renderizada. O servidor já paginava (`LIMIT 50`), mas `currentPage`/`totalPages` chegavam como prop e nunca eram usados: o histórico ficava preso aos 50 registros mais recentes sem sinal de que havia mais. Entregue junto da TASK-056 (filtro sem navegação de página é meia funcionalidade). Verificado no navegador: 131 registros em 3 páginas, 31 na última, botões desabilitados nos extremos, mobile em cards sem overflow.

### Sprint 18 ✅ — Determinismo de Render (higiene, fora do plano de migração)
> Detectado ao verificar a Sprint 17 no navegador. Não faz parte das 7 etapas da
> migração — é defeito pré-existente que a verificação expôs.
- [x] TASK-058 → eliminar render dependente do relógio no SSR. O componente é renderizado no servidor e de novo na hidratação; onde a saída dependia do relógio, o React acusava "Hydration failed" e descartava a árvore vinda do servidor. Corrida por natureza: sumia quando SSR e hidratação caíam no mesmo segundo, o que fazia o erro parecer ruído. Guard estático no fonte + regra de atraso tornada pura (`findDelayedKeys`). test→fix.

### Sprint 19 ✅ — Higiene Constitucional (pré-requisito das Etapas 3–7)
> Divergências entre a `constitution.md` e o código, achadas ao levantar o impacto do
> ADR-012. Não são causadas pela migração, mas todas caem na área que ela toca — e são
> justamente os mecanismos que deveriam proteger a virada. Ir para a internet com eles
> inertes é o pior momento possível, então vêm ANTES da Etapa 3.
- [x] TASK-059 → **Gate 2 de migrations passa a rodar de fato.** `scripts/ci-gates.sh` procura UPs em `supabase/migrations/*.sql` e `migrations/*.sql`; as migrações reais vivem em `db/migrations/`. Nenhum dos dois existe, então o gate imprime "Nenhuma migration encontrada — pulando" e passa sempre — nunca reprovou nada. O pareamento está coberto por `tests/migrations.test.ts`, não pelo gate. Corrigir o caminho e provar que o gate REPROVA um UP sem DOWN. test→fix.
- [x] TASK-060 → **`APP_ENV` implementado** conforme constitution §8. A cláusula manda todo controle ler o perfil de ambiente de `src/lib/security-profile.ts`; não há uma ocorrência de `APP_ENV` no projeto e os controles usam constantes fixas. Implementar o perfil (`dev` | `production`) com o que §8 declara relaxável (lockout, rate limit) e o que nunca é. Default seguro: ausência de `APP_ENV` = `production`. test→feat.
- [x] TASK-061 → **`Retry-After` na resposta 429** (constitution §2.6). `login/route.ts:30` devolve 429 sem o header que a cláusula exige. Divergência de mesma classe que as anteriores, encontrada ao reescrever §2.6. test→fix.
- [x] TASK-062 → **nada a fazer no código — o registro é que estava errado.** Verificado com `git ls-files`: nenhum `.db`/`.sqlite` é rastreado hoje, e `git log --all -- keys.db` mostra a remoção já feita em `23c6bcd`, `2e83857` e `5874d62`. O débito no `plan.md` (e a divergência #3 do ADR-012, que o repetiu por confiar no registro em vez de verificar) estava obsoleto. **Pendência real remanescente:** o arquivo continua nos commits antigos do histórico; expurgá-lo exige reescrever história — decisão à parte, registrada abaixo.

### Sprint 20 ✅ — Etapa 3: Schema Postgres (ADR-012)
> Primeira sprint que toca a stack. Só começa com a Sprint 19 fechada.
- [x] TASK-063 → schema Postgres equivalente, com as conversões de dialeto mapeadas no ADR-012: `IDENTITY` no lugar de `AUTOINCREMENT`, `boolean` real, `timestamptz`, `json_build_object`, `RETURNING id` no lugar de `lastInsertRowid`, `ON CONFLICT DO NOTHING`.
- [x] TASK-064 → **índices** — o schema atual não declara nenhum. Mínimo: `history(timestamp DESC)`, `history(key_id)`, `history(user_id)`, `action_logs(timestamp DESC)`, `key_transactions(key_id, status)`, `key_transactions(user_id)`. Os filtros já foram tornados sargáveis na TASK-055.
- [x] TASK-065 → imutabilidade do histórico em PL/pgSQL + `REVOKE UPDATE, DELETE` (constitution §4.4). No Postgres fica mais forte que o trigger atual: o bypass de manutenção vira `set_config` com escopo transacional, dispensando a tabela-flag `_maintenance_mode`.
- [x] TASK-066 → consolidação de legado: `employees` está morta (0 linhas) mas ainda é `LEFT JOIN`ada; `keys` tem `employee_id` e `user_id` convivendo. Decidir e consolidar antes de carregar dados.
- [x] TASK-067 → carga dos dados de `keys.db` para o Postgres, com verificação de contagem por tabela. **Cópia, não movimentação** — o `keys.db` permanece íntegro (plano de reversão do ADR-012).

### Sprint 21 ✅ — Etapa 4: Camada de Dados Assíncrona (ADR-012)
> A maior das sete. A estimativa de 158 chamadas síncronas em 31 arquivos virou **162 em
> 28** na execução: `better-sqlite3` é síncrono por design e qualquer driver Postgres é
> assíncrono — não há adaptador que evite isso. Rede de segurança: a suíte de testes,
> agora rodando contra Postgres real em container (D-11).
- [x] TASK-068 → conexão via pooler (transaction mode). O proxy global e o `resetConnection()` de `src/lib/db.ts` não sobrevivem a instâncias efêmeras. Entregue como `src/lib/pg.ts`: `query`/`queryOne`/`execute`/`withTransaction`/`closePool`, tradução um-para-um do `.all()`/`.get()`/`.run()`, com **pool preguiçoso** (ver débito abaixo) e sem `name` em consulta alguma — transaction mode não suporta statement nomeado. Infra de teste junto: `docker-compose.test.yml` + `globalSetup` que reproduz a baseline da plataforma Supabase (papéis `anon`/`authenticated`) para que as migrations de `db/migrations-pg/` rodem no container **identicamente** à produção.
- [x] TASK-069 → conversão das consultas para assíncronas, incluindo os Server Components. Executada em **5 fatias por fronteira de execução** (não por pasta — ver lição abaixo): (a) módulos de `src/lib`, (b) autenticação e conta, (c) ciclo de vida das chaves, (d) demais rotas de API, (e) Server Components + `src/lib/history-query.ts`.
- [x] TASK-070 → transações explícitas com client dedicado, no lugar de `db.transaction(() => ...)`. O bypass da imutabilidade (`db-maintenance.ts`) deixou de ser uma linha numa tabela-flag e passou a ser `set_config(..., is_local = true)` — o Postgres o descarta no COMMIT/ROLLBACK, então não há estado que possa vazar. **`src/lib/db.ts` foi apagado** e nenhum arquivo de `src/` importa mais `better-sqlite3`, que virou devDependency (as ferramentas offline `db/migrate.mjs` e `db/load-pg.mjs` continuam usando).
- [x] TASK-071 → trocar `bcrypt` (addon nativo) por `bcryptjs`. `postinstall` (que rodava `npm rebuild better-sqlite3 && node scripts/init-db.js`) removido: quebraria o build da hospedagem.
- [x] **Fora do escopo original, decidido na execução:** `src/lib/backup.ts` e as rotas `backups/restore` e `backups/import` foram **neutralizados**, não convertidos. Backup por cópia de arquivo SQLite não tem equivalente em Postgres gerenciado, e `node-cron` exige processo de longa duração que não existe em execução serverless. `createBackup()` recusa explicitamente e as rotas devolvem 503, ambos citando a **TASK-078** (Etapa 7), que é a dona do desenho substituto. O 403 de não-ADMIN e a trilha de auditoria continuam antes da recusa. Agendar e nunca rodar seria pior do que não agendar.

> ## ⚠️ Reordenação aprovada em 2026-09-04
>
> **Objetivo declarado pelo usuário: fazer o sistema funcionar no Supabase + Vercel.**
> Não há migração de dados — o conteúdo do `keys.db` anterior era fictício. A Etapa 7 foi
> antecipada; Realtime (Etapa 5) é feature, não pré-requisito do go-live, e vai para o fim.
>
> **A Etapa 6 NÃO foi adiada junto, e o motivo é dela ser pré-requisito de verdade.**
> `structured-logger.ts:51` faz `fs.mkdirSync` + `fs.appendFileSync` em `logs/`. No Vercel
> o filesystem é efêmero e somente-leitura: a escrita falha, cai no `catch` e degrada para
> `console` — **sem derrubar nada e sem alarme.** A constitution §7 já tinha antecipado
> exatamente isso ("arquivo em `logs/` não serve à hospedagem serverless… a trilha se
> perderia"), e o REQ-031 nomeia **o log estruturado** no critério de aceite (d), junto com
> `history` e `action_logs`. Subir antes da TASK-074 seria reprovar o critério do próprio
> requisito que motiva a etapa — e do jeito mais traiçoeiro, com a aplicação parecendo bem.
> Por isso a TASK-074 sobe para a Sprint 22, e a TASK-075 acompanha a TASK-078, de que é
> dependente. A Etapa 6 deixa de existir como sprint e se dissolve nas duas primeiras.

### Sprint 22 — Etapa 7a: Pré-requisitos do Go-Live (ADR-012 · REQ-031)
> Tudo que precisa estar de pé ANTES de existir uma URL pública. Nenhuma destas é
> opcional: sem a 080 não se entra, sem a 074 a trilha se perde em silêncio, e a 076/077
> são o que separa "acessível pela internet" de "exposto na internet".
- [ ] **TASK-080 → bootstrap do primeiro usuário ADMIN no Postgres. Precede a TASK-079: sem isto o sistema sobe inacessível.** REQ-001 + REQ-031. Numa base Supabase vazia não existe caminho para entrar — `scripts/init-db.js` só fala SQLite e saiu do `postinstall` na TASK-071, nenhuma migration de `db/migrations-pg/` insere usuário, e toda rota exige sessão (`/api/users` exige ADMIN). Desenho proposto — **script de operação, não rota**:
  - Vive em `db/` (junto de `migrate.mjs` e `load-pg.mjs`), fora do bundle da aplicação. Uma rota de bootstrap seria superfície de ataque permanente para um uso único; um script não é alcançável por HTTP.
  - **Recusa se `users` já tiver qualquer linha.** A garantia de "uma vez só" fica no estado do banco, não na disciplina de quem roda — mesma lógica pela qual o bypass da TASK-070 virou `set_config` transacional em vez de tabela-flag.
  - Senha inicial **nunca embutida e nunca padrão**: lida de variável de ambiente ou gerada aleatoriamente e impressa uma vez. O `admin`/`admin` do `init-db.js` nasceu numa intranet; aqui a exposição é pública (constitution §2).
  - Grava com `requires_password_change = true`. **Não inventa fluxo novo:** `login/route.ts:78` já devolve `REQUIRE_PASSWORD_CHANGE` (403) e força a troca na primeira entrada — caminho existente e testado.
  - Hash com `bcryptjs` (D-10), nunca o addon nativo. Registra a criação em `audit_logs`.
  - Teste contra o Postgres do container (D-11): cria numa base vazia; recusa numa base com usuário; a senha não aparece em log nem em `audit_logs` (constitution §6).
- [ ] **TASK-074 → `structured-logger` passa a gravar em `app_logs`** (constitution §7), com `REVOKE UPDATE, DELETE`. `app_logs` fora de `tablesToClear` — é o destino que precisa sobreviver ao REQ-014. **Trazida da Etapa 6 por ser pré-requisito do deploy** (ver quadro acima). Cuidado de teste: a falha atual é silenciosa por design (`catch` → `console`), então o teste tem de provar que a linha chega em `app_logs`, não que a chamada não lançou.
- [ ] TASK-076 → rotacionar `JWT_SECRET` com segredo aleatório real (o atual é UUID com sufixo, baixa entropia) e tornar `secure` incondicional no cookie (constitution §2.3).
- [ ] TASK-077 → autorização com defesa em profundidade em `src/proxy.ts`, que hoje só renova cookie e deixa passar requisição sem sessão. Débito registrado desde a Sprint 9 como "tolerável em rede local; endereçar antes da exposição pública" — é agora.
- [ ] **TASK-081 → a trilha de auditoria é esperada, não largada.** REQ-010 + REQ-031(d). Achado durante a TASK-076: **26 chamadas de `logAction` sem `await`**, em 12 arquivos. `logAction` grava em `action_logs` e chama `logStructured`, que a TASK-074 tornou assíncrono — e em execução serverless a instância pode congelar assim que a resposta sai, matando a escrita pendente. **Consequência direta: o que a TASK-074 entregou não se sustenta enquanto os chamadores soltam a promessa.** O critério daquela task ("a linha chega em `app_logs`") foi verificado e passa; o REQUISITO (trilha sem perda) não está cumprido. Além de corrigir os 26 pontos, deixar uma guarda mecânica — promise solta desta família não pode voltar em revisão humana.

### Sprint 23 — Etapa 7b: Backup e Deploy (ADR-012 · REQ-031)
- [ ] TASK-078 → backup gerenciado + verificação por job agendado (constitution §4.3). O endpoint de restore por cópia de arquivo **já foi desativado na Sprint 21** (503 citando esta task); aqui entra o substituto. Peso revisto: não há dado real a perder hoje, mas §4.3 exige verificação, não existência.
- [ ] TASK-075 → métrica de confiabilidade de backup deixa de ler `backups/backup-history.jsonl` e passa a ler do banco. **Trazida da Etapa 6 para junto da TASK-078**, de que é dependente: a fonte que ela lia deixou de ser escrita quando o `backup.ts` foi neutralizado.
- [ ] TASK-079 → deploy e ping agendado contra a pausa por inatividade. **Remoção do aparato local revista:** não há mais "30 dias de retenção do PM2" a esperar — não existe servidor PM2 (ver Achados de 2026-09-04). Sai junto: `.bat`, `ecosystem.config.js`, `show-ip.js`, os scripts `dev`/`start` que o invocam, e a rota `/api/server-info`, que expõe IPs de rede local via `os.networkInterfaces()` — no Vercel ela devolveria endereços de container, informação sem sentido para o operador.

### Sprint 24 — Etapa 5: Realtime (ADR-012 · REQ-032)
> Onde o requisito que motivou a migração é efetivamente entregue. **Adiada para depois do
> go-live por decisão de 2026-09-04:** é melhoria de experiência sobre um sistema que já
> funciona, não condição para ele funcionar. Até lá o polling de 3 s continua valendo.
- [ ] TASK-072 → substituir os 4 pollings de 3 s por assinatura Realtime. Critério de aceite do REQ-032: defasagem típica ≤ 500 ms, medida entre dispositivos.
- [ ] TASK-073 → degradação graciosa: sem WebSocket, cair para polling em intervalo largo em vez de deixar a tela parada.

### Etapa 6 — dissolvida
> Não existe mais como sprint. A TASK-074 subiu para a Sprint 22 (pré-requisito do deploy)
> e a TASK-075 foi para a Sprint 23 (dependente da TASK-078). Mantido aqui o registro para
> que a numeração das etapas do ADR-012 continue rastreável.

### Achados de 2026-09-04 — não existe produção (confirmado pelo usuário)

> Não há servidor PM2 em uso, não há `keys.db` com dados reais e ninguém usa o sistema
> hoje. Os dados reais ainda serão cadastrados ou importados de outra fonte, direto no
> Postgres. Três coisas que este projeto vinha carregando como verdade caem com isso.

1. **A pendência de deploy era fantasma.** `node db/migrate.mjs up` no "`keys.db` de produção" atravessou várias sprints no checkpoint descrevendo um banco que não existe — a mesma classe de erro do débito do `keys.db` rastreado no git, que a TASK-062 desmentiu. `db/migrations/` (SQLite) permanece como histórico; o Gate 2 e `tests/migrations.test.ts` seguem cobrindo o pareamento UP/DOWN. **Lição, de novo: pendência herdada se reverifica antes de ser repetida.**
2. **O plano de reversão do ADR-012 está vazio.** Os itens 2, 3 e 4 (§Reversão) pressupõem `keys.db` de produção íntegro, ponto de não-retorno na primeira escrita e servidor PM2 ligado por 30 dias. Nada disso existe. Na prática o risco é **menor** do que o ADR supõe — sem estado anterior não há o que perder —, mas o documento declara uma rede de segurança inexistente, e isso é pior do que declarar que não há rede. **Correção pendente: CR Tipo C** (changelog no `spec.md` + atualização do ADR-012). Não aplicada sem confirmação.
3. **A TASK-067 ficou sem origem.** `db/load-pg.mjs` foi construído para ler `keys.db` e reconciliar contagens. Sem `keys.db` real não há de onde carregar. O código continua correto e testado — o que falta é decidir de onde os dados reais vêm (ver Decisões pendentes).

**🚨 Gap bloqueante do go-live, ainda sem task: bootstrap do primeiro ADMIN no Postgres.**
`scripts/init-db.js` cria `admin`/`admin`, mas só fala SQLite e saiu do `postinstall` na
TASK-071. Nenhuma migration de `db/migrations-pg/` insere usuário. Toda rota exige sessão
e `/api/users` exige papel ADMIN. Numa base Supabase vazia, **ninguém consegue entrar** —
não há caminho para criar o primeiro usuário. Precisa de task própria na Etapa 7, com dois
cuidados: a senha inicial não pode ser previsível (o `admin`/`admin` do SQLite nasceu numa
intranet; aqui a exposição é pública, constitution §2) e o procedimento tem de ser
executável uma vez só, sem deixar caminho de escalada aberto depois.

### Decisões pendentes das Etapas 3–7
- ~~**Banco dos testes (Etapa 4).**~~ — **resolvida em 2026-09-03 (D-11):** Postgres real em container, conforme a recomendação do ADR-012. Implementada na TASK-068.
- **`keys.db` no histórico do git.** Não está mais rastreado (TASK-062 confirmou), mas continua nos commits antigos. Expurgar exige reescrever história — decisão do usuário. Baixo risco: o banco não contém secret, apenas dados operacionais e hashes bcrypt. **Risco revisto para BAIXÍSSIMO em 2026-09-04:** aqueles arquivos nunca contiveram dados reais.
- ~~**Origem dos dados reais (Etapa 7)**~~ — **não é bloqueio (esclarecido em 2026-09-04):** o conteúdo do `keys.db` anterior era **fictício**. Não há dado a preservar nem migração a fazer, e o objetivo declarado é fazer o sistema funcionar no Supabase + Vercel. O cadastro dos dados reais é operação posterior, pela própria UI, depois da TASK-080. **Consequência:** o `db/load-pg.mjs` da TASK-067 fica sem uso no caminho de produção — segue correto e testado, e é a ferramenta pronta caso um dia exista um SQLite de origem, mas não faz parte do go-live.
- **Dados sintéticos no Supabase — limpeza operacional, não risco de PII.** As 20 users / 5 keys / 92 tx / 30 history / 99 logs / 4 settings da TASK-067 são fictícios, como o `keys.db` que os originou; não há urgência de expurgo. Ao limpar, lembrar que `history` é imutável (TASK-065): exige o bypass autorizado do REQ-014, não um `DELETE` solto. A TASK-080 recusa base com usuário, então a limpeza de `users` é pré-requisito de rodá-la contra o Supabase atual.

### Itens não bloqueantes
- E2E smoke com Playwright para os 4 fluxos "que não podem falhar" (spec §4) — parcialmente coberto pelo setup da Sprint 4 real (login) e completado pela TASK-028.

### Débitos técnicos registrados
- ~~**Lint**~~ — **quitado (Sprint 9 — higiene, 2026-07-03):** os 64 warnings restantes (33 `no-explicit-any`, 28 `no-unused-vars`, 3 `exhaustive-deps`) foram zerados. `no-explicit-any` voltou de *warn* para *error* no `eslint.config.mjs` — nenhuma exceção residual. `npx eslint src` limpo (0 erros, 0 warnings).
- ~~**Testes desativados na Sprint 6**~~ — **quitado (TASK-035, Sprint 7):** os 4 `.test.old` viraram suíte Vitest real (session-policy, password-policy, security-profile) com cobertura extra do strict pwd_hash check.
- ~~**Next 16 — convenção `middleware` deprecada**~~ — **quitado (Sprint 9, 2026-07-03):** `src/middleware.ts` renomeado para `src/proxy.ts` (função `middleware` → `proxy`), conforme codemod oficial `middleware-to-proxy`.
- **`docs/tasks-sprint-N.md` sem arquivamento desde a Sprint 8** (2026-07-02) — as Sprints 9–14 não geraram o snapshot correspondente em `docs/`. Fonte de verdade permanece íntegra em `.sdd/memory/tasks.md` (sobrescrito por sprint) + histórico de commits (`test`/`feat`/`refactor(TASK-NNN)`) + ADRs. Não reconstruído retroativamente para evitar fabricar detalhe BDD sem fonte confiável — se precisar do arquivo formal de uma sprint passada, gerar sob demanda a partir do `tasks.md` daquele commit + `git log`.
- **TASK-042 (REQ-026, Sprint 11) entregue sem teste** — feat commit (`13f623c`) sem commit `test` correspondente e sem commit de CR (`docs: change request`) próprio; débito herdado já causou 1 falha de gate na Sprint 12 (ver métricas abaixo). Não corrigido retroativamente nesta rodada (Fase 11 é revisão/documentação, não implementação) — próxima sprint que tocar o fluxo de transferência mobile deve cobrir com teste antes de qualquer outra mudança no mesmo arquivo.
- **Autorização sem defesa em profundidade** — `src/proxy.ts` (ex-`middleware.ts`, convenção Next 16) só renova a expiração do cookie e limpa JWT inválido; requisição sem sessão segue adiante (`NextResponse.next()`). A verificação de papel é feita manualmente em cada handler, então uma rota nova esquecida nasce aberta. Tolerável em rede local; endereçar antes da exposição pública (Etapa 7).
- ~~**Erro de hidratação pré-existente**~~ — **quitado (TASK-058, 2026-09-02):** dois pontos, ambos anteriores ao ciclo de migração. `HistoryClient` renderizava `new Date().toLocaleString()` direto no JSX (commit original `95af5ac`); `DashboardClient` calculava as chaves em atraso dentro de `useMemo` a partir de `new Date().getTime()`, e o `useMemo` roda no SSR. A regra de atraso saiu para `business-rules.findDelayedKeys(keys, now)` — pura, recebe o instante como argumento — e os dois componentes passaram a usar `useClientClock` (`useSyncExternalStore`), que devolve nulo no SSR e na hidratação. Medido antes do fix: três renders do servidor devolviam `14:01:38`, `:41` e `:43` contra `14:01:08` no cliente.
- ~~**`keys.db` segue rastreado no git**~~ — **registro obsoleto, corrigido na TASK-062 (2026-09-03):** a remoção já havia sido feita em `23c6bcd`/`2e83857`/`5874d62` e nenhum `.db` é rastreado hoje. O débito permaneceu no `plan.md` por várias sprints descrevendo um problema inexistente — e chegou a ser propagado para o ADR-012. **Lição:** débito herdado deve ser reverificado antes de ser repetido em documento novo. Resta apenas o arquivo no histórico antigo de commits (ver decisão pendente).

- **Backup da aplicação sem substituto até a TASK-078 (Sprint 21 → Etapa 7).** `createBackup()` recusa e as rotas de restore/import devolvem 503. Entre o go-live e a TASK-078, a única proteção de dados é o backup gerenciado do provedor — que existe, mas não foi verificado nem tem restauração ensaiada, e constitution §4.3 exige *verificação*, não só existência. **Não é aceitável no go-live:** a TASK-078 é bloqueante para a Etapa 7, não opcional. Enquanto isso, o `keys.db` íntegro segue sendo o plano de reversão (ADR-012).
- **Lição de execução (Sprint 21) — fatia se desenha por fronteira de execução, não por pasta.** As 5 fatias da TASK-069 foram desenhadas por diretório e isso produziu **4 correções de escopo**: `history-query.ts`, `db-maintenance.ts` e `backup.ts` saíram das fatias em que estavam, e `user-confirm` voltou para a fatia (c) depois de ter saído — o teste provou que a dupla confirmação atravessa `transactions/route.ts` e `user-confirm` **em tempo de execução**, e converter um sem o outro deixa o fluxo pela metade. Converter é uma operação sobre o grafo de chamadas; a árvore de pastas é só uma projeção dele.
- **Lição de execução (Sprint 21) — a suíte cobre funções, não o sistema.** Dois defeitos passaram por 270+ testes verdes: (1) o pool criado no topo de `src/lib/pg.ts` quebrava `npm run build` (o Next importa cada rota para coletar dados da página, e ali não há `DATABASE_URL`; em teste ela sempre existe); (2) `normalizeTimestamp` recebia `Date` do driver e chamava `.trim()` nele — a página de histórico quebrava no navegador, mas nenhum teste passava valor lido do banco pela formatação que a tela usa. Ambos foram cobertos test-first depois do fato, e **`npm run build` + render no navegador entraram na verificação de cada fatia**. Nota operacional: a verificação no navegador e a suíte compartilham o mesmo container, e `tests/setup.ts` dá `TRUNCATE` — semear para verificação e rodar `vitest` na sequência apaga a semente. **Reincidiu 3x na Sprint 22**, sempre com a mesma aparência enganosa: o login passa a recusar credencial que estava correta, e o primeiro palpite é defeito no código de autenticação que se acabou de escrever. Regra prática adotada: **verificação no navegador é sempre o ÚLTIMO passo**, depois da suíte e dos gates. Se voltar a atrapalhar, a correção de verdade é um segundo banco no mesmo container só para verificação manual.

- *(novas ideias entram aqui via Change Request, nunca direto no código)*

## 7. Encerramento do Roadmap Inicial (Fase 11 — 2026-07-10)

O backlog de sprints planejadas está vazio — Sprint 14 foi a última entregue e não há
próxima sprint definida. Revisão de estado real antes de qualquer merge/deploy:

- **`main` está travado em `e873796` (2026-07-03, fim da Sprint 9)** — 72 commits das
  Sprints 10–14 (mais o CR do REQ-021/bypass e a reformulação de UI/UX) existem apenas em
  branches de feature (`feature/sprint-10-*` … `feature/sprint-14-fluxo-unificado`) e na
  branch de trabalho atual, nunca mergeados nem deployados. `docs/releases/` nunca existiu.
- **Release consolidado gerado**: `docs/releases/release-v0.2.0.md` — cobre REQ-021 a
  REQ-029 como uma única entrega (nada disso foi deployado separadamente até aqui).
  Risco 🟡 (uma migration real no lote: `202607041500_add_justification`, UP/DOWN pareados).
- **Aceite do Cliente**: registrado retroativamente como N/A (exceção MODO EXPRESSO/uso
  interno) para as Sprints 7–14 — ver changelog do `spec.md`. Protocolo passa a valer de
  fato a partir do próximo ciclo.
- **Threat model**: revisado — `docs/threat_model_stride.md` e a cópia em `.sdd/memory/`
  já estavam sincronizadas (2026-07-10) e cobrem a superfície atual; Sprint 14 foi só UI,
  sem rota/integração/schema novos, então nenhuma atualização adicional foi necessária.
- **Cross-tenant**: N/A — projeto de cliente único, sem `tenant_id` (constitution §0).
- **Pendente (ação manual, fora do escopo desta revisão)**: push da branch + PR + merge em
  `main` + deploy PM2 real. Antes de mergear, considerar consolidar as branches de feature
  soltas (`feature/sprint-10-*` a `feature/sprint-13-*`) na branch atual ou confirmar que já
  estão todas presentes nela (ver `git log main..HEAD`).

## 5. AI Cost Budget
Opcional em MODO EXPRESSO — não definido. Se sprints agentic forem executadas via API paga, definir cap mensal antes da Sprint 1.

## 6. Métricas do Processo
> Preenchida pelo memory-agent no Step 10 de cada sprint. Fontes mecânicas: git log
> (datas), tasks.md vs Report (pontos e retrabalho). Não estime — meça.

| Sprint | Início | Fim | Dias | Pts plan. | Pts entr. | Tasks c/ retrabalho | Falhas de gate | Bugs pós-release | Custo IA (US$) |
|--------|--------|-----|------|-----------|-----------|--------------------|----------------|------------------|----------------|
| 7 (dívida) | 2026-07-02 | 2026-07-02 | 1 | 15 | 15 | 0 | 1 (pre-commit lint bloqueado por débito legado — quitado na própria sprint) | — | — |
| 8 (mobile) | 2026-07-02 | 2026-07-02 | 1 | 14 | 14 | 0 | 1 (boot Edge Runtime quebrado por regressão da Sprint 7 — corrigido; detectado pelo E2E) | — | — |
| 10 (transfer) | 2026-07-06 | 2026-07-06 | 1 | 15 | 15 | 0 | 1 (lint type checking) | — | — |
| 12 (pull REQ-027) | 2026-07-07 | 2026-07-07 | 1 | 3 tasks | 3 (045 consolidada em 044) | 0 | 1 (Gate 4 falha por débito herdado da Sprint 11 — TASK-042 feat sem test; não introduzido nesta sprint) | — | — |
| 13 (devolução REQ-028) | 2026-07-07 | 2026-07-07 | 1 | 2 tasks | 2 | 1 (TASK-047: seletor e2e ambíguo + stash interrompido pelo lock do keys.db do dev server — recuperado sem perda) | 0 | — | — |
| 14 (fluxo unificado REQ-029) | 2026-07-10 | 2026-07-10 | 1 | 4 tasks | 4 | 0 | 0 (todos os gates verdes em cada task) | — | — |
| 20 (schema Postgres · Etapa 3 ADR-012) | 2026-09-03 | 2026-09-03 | 1 | 5 tasks | 5 | 1 (TASK-065: search_path mutavel em history_imutavel introduzido pela propria task, achado do get_advisors e corrigido em test->fix; e o criterio de EXPLAIN da TASK-064 reescrito na execucao — Index Cond vs Filter no lugar de Seq Scan) | 1 (Gate 5 type-check: literal BigInt e counts sem tipo em pg-load.test — corrigido com .d.mts) | — | — |
| 21 (camada async · Etapa 4 ADR-012) | 2026-09-03 | 2026-09-04 | 2 | 4 tasks | 5 (as 4 + neutralizacao do backup, fora do escopo original) | 2 (TASK-068: pool criado no topo do modulo quebrou `npm run build` — refeito preguicoso em fix; TASK-069: 4 correcoes de escopo entre fatias — history-query, db-maintenance e backup sairam, user-confirm voltou — mais o `Date` do driver na formatacao, corrigido em test->fix) | 2 (Gate 5 type-check: `if (checkLockout(...))` com Promise<boolean> sempre verdadeiro em login/route — travaria todo usuario, pego antes do commit; `npm run build`: pool no topo do modulo) | — | — |
