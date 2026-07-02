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

## 4. Backlog — Próximas Sprints (pós-estabilização)
- E2E smoke com Playwright para os 4 fluxos "que não podem falhar" (spec §4) — recomendado em MODO EXPRESSO, não bloqueante; promover a sprint quando a rede de testes (Sprint 3) estiver estável.

### Sprint 7 — Responsividade Mobile (CR 2026-07-02, Tipo C — REQ-016, ADR-001)
> Tasks tipo Refactor. Implementação dentro do CSS nativo (D-03 mantida), tokens do
> `ui-context.md`. Critérios BDD detalhados na Fase 9. Alvo: funcional a partir de 360px.
- TASK-023 → REQ-016: layout base responsivo — breakpoints documentados em `globals.css`, shell/navegação mobile (menu do usuário e navegação colapsáveis em telas pequenas).
- TASK-024 → REQ-016: `/login` e `/confirm` mobile-first — fluxo do portador (funcionário/aluno) no celular; alvos de toque ≥ 44px.
- TASK-025 → REQ-016: dashboard (`/`) — cards de chaves emprestadas/disponíveis, pendências e alertas adaptados a telas pequenas.
- TASK-026 → REQ-016: telas de listagem (`/history`, `/logs`, `/users`, `/keys`) — padrão tabela→card em viewport estreito, mantendo filtros e ações.
- TASK-027 → REQ-016: formulários e modais (`/settings`, `/account/profile`, `/account/security`, modais de confirmação destrutiva) adaptados a touch.
- TASK-028 → REQ-015/016: E2E smoke Playwright dos 4 fluxos críticos (spec §4) com viewport mobile 375×812, somado ao viewport desktop.

### Débitos técnicos registrados
- **Lint:** `npx eslint src` acusa 46 erros (majoritariamente `no-explicit-any` e `no-unused-vars`) + scripts utilitários (`scripts/`, `scratch/`, `tmp/`) com `no-require-imports`. Detectado no gate de merge da Sprint 6 (2026-07-02). Ação: sprint de higiene ou ajuste de escopo do ESLint (ignorar `scripts/`/`scratch/`/`tmp/`, corrigir `src/`). Regra vigente: nenhuma sprint pode introduzir erro novo.
- **Testes desativados na Sprint 6:** 4 arquivos renomeados para `.test.old` em `src/lib/` (`schemas`, `security-profile`, `session-expiration`, `session`) — cobertura do REQ-011/012 (Sprint 1) fora da suíte. Detectado no merge de 2026-07-02. Ação: reativar/adaptar antes ou durante a Sprint 7 — violação do REQ-015 se permanecer.

- *(novas ideias entram aqui via Change Request, nunca direto no código)*

## 5. AI Cost Budget
Opcional em MODO EXPRESSO — não definido. Se sprints agentic forem executadas via API paga, definir cap mensal antes da Sprint 1.

## 6. Métricas do Processo
> Preenchida pelo memory-agent no Step 10 de cada sprint. Fontes mecânicas: git log
> (datas), tasks.md vs Report (pontos e retrabalho). Não estime — meça.

| Sprint | Início | Fim | Dias | Pts plan. | Pts entr. | Tasks c/ retrabalho | Falhas de gate | Bugs pós-release | Custo IA (US$) |
|--------|--------|-----|------|-----------|-----------|--------------------|----------------|------------------|----------------|
