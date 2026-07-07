# plan.md — Como & Roadmap (UniFafire · Sistema de Gerenciamento de Chaves)

> Perspectiva de engenharia. Gerado na Fase 6. Toda mudança de escopo passa antes
> pelo Changelog do `spec.md`. Decisões não-óbvias registradas na §2.

## 1. Stack Aprovada (Fase 5 — legado mantido como baseline)

| Camada | Tecnologia | Observação |
|---|---|---|
| Full-stack | Next.js (App Router) + React 19 + TypeScript | já em produção local |
| Banco | SQLite via better-sqlite3 (arquivo `keys.db`) | prepared statements obrigatórios |
| Auth | JWT (`jose`, HS256) em cookie + `bcrypt` | segredo migra para `.env` (Sprint 1) |
| Validação | Zod (`src/lib/schemas.ts`) | fonte única de schemas e RBAC |
| Jobs | node-cron (`src/lib/backup.ts`) | backup diário |
| UI | CSS nativo estruturado + tokens do `ui-context.md` + react-hot-toast | sem migração para shadcn — ver D-03 |
| Hospedagem | PM2 em servidor local (scripts `.bat` / `ecosystem.config.js`) | intranet |
| Testes | Vitest (unit/integração) + Playwright (E2E smoke, recomendado) | a introduzir na Sprint 3 |
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

### Sprint 13 — Devolução Forçada Ampla e Clareza Mobile (CR 2026-07-07, Tipo C — REQ-028, ADR-009)
> Mudança em feature entregue (mobile/bypass). Sem migration (coluna `justification` já existe).
> Aproveita o WIP de responsividade CSS-driven (`.mobile-only`/`.desktop-only`) já iniciado.
- TASK-046 → REQ-028: API — devolução forçada de qualquer chave em uso por porteiro/admin, com justificativa obrigatória informada no ato (não herdada) e log de auditoria; test→feat.
- TASK-047 → REQ-028: UI mobile — botão "Devolver" no card (portador/portaria) + campo de justificativa na devolução forçada + estados claros (portador/solicitante/ação pendente); consolida o refactor CSS-responsivo; `withdraw_justification`/`in_use_since` no SSR; test (e2e) → feat.

### Itens não bloqueantes
- E2E smoke com Playwright para os 4 fluxos "que não podem falhar" (spec §4) — parcialmente coberto pelo setup da Sprint 4 real (login) e completado pela TASK-028.

### Débitos técnicos registrados
- ~~**Lint**~~ — **quitado (Sprint 9 — higiene, 2026-07-03):** os 64 warnings restantes (33 `no-explicit-any`, 28 `no-unused-vars`, 3 `exhaustive-deps`) foram zerados. `no-explicit-any` voltou de *warn* para *error* no `eslint.config.mjs` — nenhuma exceção residual. `npx eslint src` limpo (0 erros, 0 warnings).
- ~~**Testes desativados na Sprint 6**~~ — **quitado (TASK-035, Sprint 7):** os 4 `.test.old` viraram suíte Vitest real (session-policy, password-policy, security-profile) com cobertura extra do strict pwd_hash check.
- ~~**Next 16 — convenção `middleware` deprecada**~~ — **quitado (Sprint 9, 2026-07-03):** `src/middleware.ts` renomeado para `src/proxy.ts` (função `middleware` → `proxy`), conforme codemod oficial `middleware-to-proxy`.

- *(novas ideias entram aqui via Change Request, nunca direto no código)*

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
