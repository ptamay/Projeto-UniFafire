---
trigger: model_decision
description: "Ative OBRIGATORIAMENTE quando o usuário trouxer uma ideia nova, pedir para melhorar algo já planejado, ou propor mudança de escopo pós-Fase 6."
---

# 40-change-request — Novas Ideias e Mudanças de Escopo (Model Decision)

Quando o usuário trouxer uma ideia nova ou mudança de escopo, classifique antes de agir.

> ✅ Este arquivo é AUTOCONTIDO. Tudo que você precisa para executar um Change Request está
> aqui embaixo — classificação, gate de migration, checklist de estado final, commit e
> memory sync. **Não abra outro arquivo para agir.** (A Seção 6.1 do `master-spec-core.md`,
> dentro da skill `novo-projeto`, é a fonte histórica desta regra; consultá-la é opcional e
> nunca pré-requisito para classificar ou executar.)

## Classificação

**TIPO A — Nova feature sem impacto no que já existe**
→ Vai para backlog do `plan.md` (## Backlog — Próximas Sprints)
→ Entra na Fase 8/9 da sprint adequada. Nenhum artefato existente é alterado.

**TIPO B — Melhoria de feature especificada mas não implementada**
→ Atualiza `spec.md` (changelog) + `plan.md`. Atualiza BDD se a task já existe.

**TIPO C — Mudança em feature já implementada**
→ Atualiza `spec.md` (changelog com data e motivo)
→ Cria/atualiza ADR em `/docs/adr/`
→ Gera task no backlog tipo Refactor/Fix — entra no ciclo TDD, não ad-hoc

**TIPO D — Mudança que afeta `constitution.md`**
→ REQUER aprovação explícita antes de qualquer alteração
→ Apresente impacto completo: tasks afetadas, risco de regressão, ADRs a atualizar
→ Só após confirmação: atualiza constitution.md + spec.md + plan.md

## Gate de Migration (se o CR tocou schema)
Antes do commit: cada UP em `supabase/migrations/` tem DOWN pareado em `db/migrations/`.
DOWN faltando = BLOQUEADOR. Ver `20-migrations.md`.

## Checklist de Estado Final (antes do commit)
`spec.md` e `plan.md` devem refletir o estado FINAL do CR — não uma iteração anterior.
Se o CR foi iterado mais de uma vez: remova/marque entradas antigas obsoletas, quite
"débitos a gerar" mencionados em iterações anteriores.

## Commit + Memory Sync (obrigatório)
```
docs: change request — [título]
Tipo: A | B | C | D
Afeta: spec.md | plan.md | constitution.md | adr/ADR-NNN
```
Após o commit, Memory Sync (mesmo fora de sprint):
→ atualize `CLAUDE.md ## Checkpoint Atual` (branch real, última/próxima ação)
→ commit separado: `chore: memory sync pós-CR — [título]`

## Regras
- Nunca implemente diretamente — sem rastreabilidade no spec = escopo fantasma
- Tipo C e D sempre geram ADR
- Nunca classifique como Tipo A silenciosamente para evitar trabalho — na dúvida, pergunte
- A implementação entra pelo ciclo TDD na próxima sprint
