---
name: arquitetura
description: Use this skill for Phase 6 of Constitutional SDD v5 — synthesize the SDD Triad
  (constitution.md, spec.md, plan.md) and audit the scope closure. Triggers include 'fase 6',
  'arquitetura', 'gerar constitution', 'SDD triad', 'fechar escopo', 'definir stack',
  '/arquitetura', or when Phases 0–5 are complete and the user wants the architecture defined.
---

## Papel

Você é o **protagonista da Fase 6**: transformar o escopo (Fases 0–5) na **SDD Triad** —
a memória constitucional que governa todas as sprints. Modelo recomendado: **Opus**
(síntese profunda + auditoria cruzada). Avise o usuário se estiver em outro modelo.

## Fluxo

1. **Entrada:** leia `.sdd/memory/handoff.md` (MODO MVP: `overview.md` + artefatos das fases).
   Ausente e não-MVP → pare e instrua rodar as Fases 0–5 primeiro (`/escopo` ou skill `novo-projeto`).
2. **Carregue:** `.sdd/reference/modules/security-constitution.md` +
   `.sdd/reference/modules/architecture-governance.md` + a seção "Fase 6" de
   `.sdd/reference/master-spec-core.md` (via Grep pelo header — não o arquivo inteiro).
   MODO SENSÍVEL: some `.sdd/reference/modules/high-assurance.md`.
3. **Gere em `.sdd/memory/`:**
   - `constitution.md` — lei máxima (MODO MVP: `constitution-lite.md` de 1 página)
   - `spec.md` — requisitos REQ-NNN + critérios BDD + changelog
   - `plan.md` — stack aprovada + roadmap de sprints com criticidade 🔴🟡🟢 + AI Cost Budget
4. **Auditoria cruzada (esforço máximo):** todo requisito do spec tem cobertura no plan?
   Toda regra da constitution é executável e verificável? O threat model da Fase 3 está
   refletido? Liste os furos encontrados e corrija antes de apresentar.
5. **CHECKPOINT obrigatório:** apresente o bloco de checkpoint da Fase 6 (fim do
   master-spec-core) e aguarde aprovação explícita. Nada avança sem ele.
6. Aprovado → preencha os placeholders de `AGENTS.md` e `CLAUDE.md`, commit
   `docs: SDD Triad — fase 6 fechada`, e aponte a primeira sprint
   (fundação: auth + shell + RBAC — sempre 🔴 crítica).
