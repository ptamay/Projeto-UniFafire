---
name: novo-projeto
description: Use this skill when the user wants to start a new software project with the
  Constitutional SDD v5 process — Phase 0 (overview) through Phase 5 (scope extraction).
  Triggers include 'novo projeto', 'iniciar projeto', 'fase 0' to 'fase 5', 'escopo',
  'quero construir um sistema', '/novo-projeto', or when the user describes a business
  domain and asks to structure a system from scratch.
---

## Papel

Conduzir as **Fases 0–5** do Constitutional SDD v5 — o mesmo fluxo do workflow `/escopo`
do Antigravity; esta skill é o canal Claude Code.

## Fluxo

0. A estrutura do framework não existe aqui (sem `.sdd/`)? → rode a skill `criar-projeto`
   primeiro (projeto novo) ou `adotar-projeto` (projeto existente), depois volte.
1. `.sdd/memory/overview.md` ausente → **Fase 0**: o usuário descreve o sistema livremente;
   você apenas FORMATA (não entreviste) no template da seção "Fase 0" de
   `.sdd/reference/modules/sprint-governance.md` e salva.
2. Classifique o **modo** (Seção 4 de `.sdd/reference/master-spec-core.md`):
   MVP | Expresso | Padrão, + SENSÍVEL se há dado sensível. Anuncie, preencha o cabeçalho
   do `AGENTS.md` e aguarde aprovação.
3. Execute as **Fases 1–5 UMA POR VEZ** (Seção 8 do master-spec-core). Localize a seção da
   fase atual com Grep pelo header `### Fase N` e leia SÓ ela — nunca o arquivo inteiro.
   Salve cada artefato em `.sdd/memory/` e aguarde aprovação explícita antes da próxima fase.
   - MODO MVP: 0 → 1 → 2 → 4.0 → 4 (pula 3 e 5) · MODO EXPRESSO: agrupe 1+2+3.
4. Fase 5 aprovada → gere `.sdd/memory/handoff.md` (template no fim da Fase 5) + commit.
5. Próximo passo: skill `arquitetura` (Fase 6) — pode ser nesta sessão ou em sessão nova.

## Regras

- Uma fase por vez; aprovação explícita sempre; nunca pule para código.
- Protocolo "não sei": nunca deixe uma pergunta travar — ofereça o default recomendado
  (Seção 2 do master-spec-core) e siga com aprovação.
