---
description: Fases 8–11 — seleção de sprint, micro-spec e execução TDD com gates mecânicos
---

> A regra `10-sprint-tdd.md` governa este workflow. `constitution.md` + `plan.md` são
> pré-requisito — se ausentes, pare e instrua rodar a Fase 6 no Claude Code.

1. **Fase 8 — seleção:** leia `.sdd/memory/plan.md`, confirme com o usuário a sprint ativa e a
   criticidade (🔴/🟡/🟢). Emita a linha 🎛️ (canal · modelo · esforço + motivo — protocolo na
   regra `10-sprint-tdd.md`) para a sprint e depois antes de CADA task. Sprint 🔴 crítica
   (auth, RLS, financeiro, dado sensível, carga de dados) → recomende executar no
   **Claude Code** (skill `sprint`); se o usuário aceitar, pare aqui.
2. **Fase 9 — micro-spec:** se `.sdd/memory/tasks.md` não cobre a sprint, gere-o (template:
   seção "Fase 9" de `.sdd/reference/modules/sprint-governance.md`) com tasks TASK-NNN +
   critérios BDD, em fatias verticais. Aguarde aprovação.
3. **Fases 10–11 — execução:** siga os steps da regra `10-sprint-tdd.md`
   (task-agent → code-agent por task → review-agent → report → memory sync).
   TDD atômico por task; emita a linha 🔒 do `00-core.md` antes de cada implementação.
4. **Gates:** Definition of Done da regra 10 por task + `./scripts/ci-gates.sh` (autodetecta
   a stack) + Semgrep + auditoria de dependências limpos antes de qualquer push. Falha = BLOQUEADOR.
5. A sprint SÓ encerra com o commit `chore: memory sync sprint-N` (Step 10) e o
   `CLAUDE.md ## Checkpoint Atual` atualizado.
