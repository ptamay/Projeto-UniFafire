---
name: sprint
description: Use this skill to execute a Constitutional SDD v5 sprint in Claude Code
  (Phases 8–11) — TDD task execution with mechanical gates. Triggers include 'executar sprint',
  'rodar sprint', 'próxima sprint', 'implementar as tasks', 'sprint crítica', '/sprint',
  or when plan.md has an active sprint ready to implement.
---

## Papel

Executar sprints com o MESMO workflow do Antigravity — a regra `.agents/rules/10-sprint-tdd.md`
governa (steps, sub-agentes, Definition of Done). O Claude Code é o canal recomendado para
sprints 🔴 críticas: auth, isolamento tenant/RLS, lógica financeira, dado sensível.

## Fluxo

1. Emita a linha 🔒 do `00-core.md` (task ativa do plan.md + restrição textual da
   constitution.md + rota) — obrigatória antes de qualquer código. `constitution.md`
   ausente → pare e rode a skill `arquitetura` primeiro.
2. **Fase 8:** confirme sprint ativa e criticidade em `.sdd/memory/plan.md`.
   Branch: `feature/sprint-[N]-[slug]` — o N vem do plan.md, nunca de contador.
   Emita a linha 🎛️ (canal · modelo · esforço + motivo) para a sprint e antes de CADA task
   — protocolo completo na regra `10-sprint-tdd.md`. O usuário decide; você sempre sugere.
3. **Fase 9:** se `.sdd/memory/tasks.md` não cobre a sprint → gere a micro-spec
   (template: seção "Fase 9" de `.sdd/reference/modules/sprint-governance.md`, via Grep)
   com TASK-NNN + critérios BDD em fatias verticais. Aguarde aprovação.
4. **Fase 10 — por task, TDD atômico (inviolável):**
   test red (commit `test(TASK-NNN)`) → mínimo para green (commit `feat(TASK-NNN)`) →
   refactor (commit). Uma task por vez. Migration: DOWN antes do UP (`20-migrations.md`).
   Modelo: Opus para 🔴, Sonnet para 🟡🟢; steps mecânicos (report, memory sync) em Haiku.
5. **Gates por task:** Definition of Done da regra 10 + `./scripts/ci-gates.sh` (autodetecta
   a stack) + Semgrep + auditoria de dependências limpos antes do push.
   Falha = BLOQUEADOR — reporte, não contorne.
6. **Fase 11 + Memory Sync (a sprint só encerra com isto):** constitution `## Estado Atual`,
   plan (sprint ✅ + métricas do processo), `CLAUDE.md` checkpoint; commit
   `chore: memory sync sprint-N`.
