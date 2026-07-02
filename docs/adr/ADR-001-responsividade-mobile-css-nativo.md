# ADR-001 — Responsividade mobile dentro do CSS nativo existente

- **Status:** Aceito
- **Data:** 2026-07-02
- **Origem:** Change Request Tipo C (spec.md changelog v1.1, REQ-016)
- **Decide sobre:** como tornar todas as telas 100% funcionais em mobile

## Contexto

O sistema de chaves da UniFafire tem como fluxo central a dupla confirmação: o porteiro
registra retirada/devolução e o portador (funcionário ou aluno) confirma a própria
transação em `/confirm`. Na prática, o portador faz isso pelo celular — mas a UI atual
foi construída para desktop: apenas 5 arquivos possuem media queries (`globals.css`,
`page.module.css`, `HistoryClient`, `ProfileClient`, `SecurityClient`), e as telas de
keys, users, settings, logs, confirm e login não têm nenhuma adaptação responsiva.
As telas de listagem (histórico, logs, usuários, chaves) usam tabelas largas que não
cabem em telas pequenas.

## Decisão

1. **Implementar responsividade dentro do CSS nativo estruturado do legado**, usando os
   tokens do `.agents/memory/ui-context.md`. A decisão D-03 do `plan.md` (não migrar para
   Tailwind/shadcn) permanece válida: responsividade é alcançável com media queries e
   layout fluido, sem reescrita de stack.
2. **Abordagem mobile-first nos fluxos do portador** (`/login`, `/confirm`): essas telas
   são desenhadas para o celular primeiro, com o desktop como progressão.
3. **Padrão tabela→card**: telas de listagem mantêm tabela em viewports largas e trocam
   para layout de cards empilhados em telas pequenas (breakpoint único documentado em
   `globals.css`).
4. **Restrições mensuráveis** (spec.md §6): funcionalidade completa a partir de 360px de
   largura; alvos de toque ≥ 44px nos controles dos fluxos críticos.
5. **Verificação por E2E**: smoke Playwright dos 4 fluxos "que não podem falhar"
   (spec.md §4) executado também com viewport mobile (375×812).

## Alternativas descartadas

| Alternativa | Motivo do descarte |
|---|---|
| Migrar UI para Tailwind + shadcn/ui | Reabre D-03; reescrita visual completa sem valor de negócio, alto risco de regressão sobre telas já estáveis |
| App mobile dedicado (PWA/nativo) | Fora do escopo e da stack aprovada; sistema roda em intranet, navegador mobile atende 100% do caso de uso |
| Adaptar só as telas do portador | Requisito de negócio explícito: **todas** as telas devem ser funcionais em mobile (porteiros e gestão também usam celular) |

## Consequências

- Novas tasks tipo Refactor no backlog do `plan.md` (TASK-023 a TASK-028), previstas
  para a Sprint 8 (renumerada de 7 para 8 na reconciliação ADR-002) — após a
  Sprint 7 — Dívida de Estabilização (D-06 preservada).
- Nenhuma mudança de schema — sem migrations envolvidas.
- Nenhuma mudança na `constitution.md` — não é Tipo D.
- Toda tela nova criada a partir deste ADR já nasce responsiva (critério de aceite
  padrão nos BDDs das próximas sprints).
