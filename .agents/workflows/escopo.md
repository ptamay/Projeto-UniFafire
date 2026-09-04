---
description: Fases 0–5 — extração de escopo guiada, uma fase por vez, com aprovação explícita
---

1. Se `.sdd/memory/overview.md` não existe → **Fase 0**: peça a descrição livre do sistema e
   apenas FORMATE (não entreviste) no template da seção "Fase 0" de
   `.sdd/reference/modules/sprint-governance.md`. Salve em `.sdd/memory/overview.md`.
2. Classifique o **modo** (MVP | Expresso | Padrão, + SENSÍVEL se há dado sensível) lendo a
   Seção 4 de `.sdd/reference/master-spec-core.md`. Anuncie o modo, as fases que serão puladas
   e preencha o cabeçalho do `AGENTS.md`. Aguarde aprovação.
3. Execute as **Fases 1–5 UMA POR VEZ**, lendo em `.sdd/reference/master-spec-core.md` apenas
   a seção da fase atual (Seção 8 — `### Fase N`). Ao final de cada fase, salve o artefato
   indicado em `.sdd/memory/` e aguarde aprovação explícita antes da próxima.
   - MODO MVP: fases 0 → 1 → 2 → 4.0 → 4 (pula 3 e 5)
   - MODO EXPRESSO: agrupe as Fases 1+2+3 em uma única interação
4. Fase 5 aprovada (ou Fase 4 no MVP) → gere `.sdd/memory/handoff.md` (template no fim da
   Seção 8, Fase 5) e commite todos os artefatos de escopo.
5. Encerre com: "Escopo fechado. Abra o **Claude Code** na raiz do projeto e diga 'fase 6'
   (skill `arquitetura`) para gerar a SDD Triad. A Fase 6 NÃO roda aqui."
