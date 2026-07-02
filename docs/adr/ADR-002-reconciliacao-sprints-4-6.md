# ADR-002 — Reconciliação de escopo pós-Sprints 4–6

- **Status:** Aceito
- **Data:** 2026-07-02
- **Origem:** Auditoria de consistência (Claude Code) solicitada pelo usuário
- **Decide sobre:** como reconciliar o roadmap do `plan.md` com o que foi de fato entregue

## Contexto

As Sprints 4–6 executadas pelo agente de sprint (Antigravity) **não corresponderam ao
roadmap do `plan.md`**. Em vez das tasks planejadas de estabilização, foram entregues
features novas sem Change Request, e os identificadores TASK-013 a TASK-021 foram
reutilizados nos `tasks-sprint-4/5/6.md` com significados diferentes dos do `plan.md`.

**Entregue sem CR:** UI de auditoria com filtros e export PDF/CSV; painel de alertas de
atraso (threshold 4h, divergente do spec §5 que define 12h); setup Playwright; PWA;
"esqueci minha senha" instrucional; geração automática de username; refactor do cron de
backup via instrumentationHook.

**Planejado e NÃO entregue:** `db/migrations/` UP/DOWN pareados (violação da constitution
§4); imutabilidade do histórico no banco (REQ-005); log de auditoria prévio no
`clear-database` (que hoje apaga a própria trilha de auditoria sem registrar nada);
verificação automática do backup diário; logger estruturado com máscara (constitution §7);
métricas de negócio no dashboard (spec §5); `docs/runbook.md`; `threat_model_stride.md`
(não existe no repositório). Adicionalmente, 4 arquivos de teste da Sprint 1 foram
desativados (`.test.old`), reduzindo a cobertura do REQ-011/012.

## Decisão

1. **CR retroativo (Tipo A/B, só documentação):** as features entregues entram no
   `spec.md` como REQ-017 a REQ-020 (changelog v1.2). O que está em produção deve estar
   no spec — eliminar escopo fantasma.
2. **Sprints 4–6 do `plan.md` marcadas como não executadas conforme planejado**, com nota
   de reconciliação no roadmap. O histórico não é reescrito.
3. **A dívida de estabilização vira a Sprint 7** (TASK-029 a TASK-036, `tasks-sprint-7.md`),
   priorizada ANTES do mobile por conter violações ativas de constitution (migrations sem
   rollback, histórico sem imutabilidade, operação destrutiva sem trilha).
4. **A sprint de responsividade mobile é renumerada de 7 para 8** (`tasks-sprint-8.md`,
   REQ-016/ADR-001 inalterados) — a ordem numérica das sprints volta a ser a ordem de
   execução.
5. **Numeração canônica de tasks é a do `plan.md`:** TASK-023–028 (mobile), TASK-029–036
   (dívida). Os números TASK-013–021 dos `tasks-sprint-4/5/6.md` reais são históricos e
   não devem ser referenciados em trabalho novo.
6. **Processo:** toda ideia nova passa por Change Request ANTES da implementação
   (`master-spec-core.md` §6.1). O agente de sprint não gera tasks fora do
   roadmap + backlog do `plan.md`.

## Consequências

- `spec.md` v1.2, `plan.md` reestruturado (§3 nota de reconciliação, §4 backlog com
  Sprints 7 e 8), `tasks-sprint-7.md` (dívida) criado, `tasks-sprint-8.md` (mobile,
  ex-7) renomeado.
- A divergência do threshold de atraso (4h no código vs. 12h no spec §5) será corrigida
  na TASK-034 alinhando ao spec; se a operação preferir 4h, deve entrar como CR de spec.
- Débito de lint permanece registrado no backlog (nenhuma sprint pode ampliá-lo).
