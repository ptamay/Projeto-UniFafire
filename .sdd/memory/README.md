# .sdd/memory — Memory Bank do projeto

Cérebro externo persistente do projeto. Sem ele, cada sessão de agente começa do zero.
Cada arquivo tem UM dono de fase:

| Arquivo | Criado na | Conteúdo |
|---------|-----------|----------|
| `overview.md` | Fase 0 | descrição do sistema formatada (fonte: o usuário) |
| `ui-context.md` | Fase 4.0 | identidade visual + layout shell |
| `handoff.md` | Fase 5 | resumo de escopo para a Fase 6 (Opus) |
| `constitution.md` | Fase 6 | **LEI MÁXIMA** (MODO MVP: `constitution-lite.md`) |
| `spec.md` | Fase 6 | requisitos REQ-NNN + critérios BDD + changelog |
| `plan.md` | Fase 6 | stack aprovada + roadmap de sprints (com criticidade) + backlog |
| `tasks.md` | Fase 9 | micro-spec da sprint ativa (TASK-NNN) |

Regras:
- Agentes só escrevem aqui via Memory Sync ou na fase correspondente — nunca sobrescrevem livremente.
- `constitution.md` é somente leitura fora do bloco `## Estado Atual`.
- Templates de cada arquivo: `.sdd/reference/` (master-spec-core.md e sprint-governance.md).
