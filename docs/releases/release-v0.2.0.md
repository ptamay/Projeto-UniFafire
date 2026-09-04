# Release v0.2.0 — Consolidação de Transferências, Fluxo "Pull", Devolução Ampla e Fluxo Unificado do Dashboard

**Data:** 2026-07-10
**Ambiente:** ainda não deployado — documento gerado antes do merge em `main` (Fase 11,
`sprint-governance.md`), conforme exigido pela regra "Release Governance obrigatório antes
de merge em `main`".
**Versão anterior:** v0.1.0 (baseline `main` em `e873796`, 2026-07-03 — fim da Sprint 9)

> **Por que consolidado em vez de 5 releases separados:** as Sprints 10–14 (mais o CR do
> REQ-021) nunca foram mergeadas nem deployadas individualmente — os 72 commits existem
> apenas em branches de feature. Documentar como uma única entrega reflete a realidade do
> que de fato vai para produção junto, em vez de fabricar uma separação que nunca existiu
> na prática.

## Changelog

### Adicionado
- [REQ-021] Bypass de dupla confirmação para porteiro/gestor atribuir chave diretamente com
  justificativa auditável; barra de Ação Rápida com autocomplete e chaves frequentes por
  chave; navegação total por teclado. (ADR-003, CR `d4fc3e3`) ⚠️ *implementado antes da
  disciplina TASK-NNN/TDD adotada a partir da Sprint 10 — sem commits `test`/`feat(TASK-NNN)`
  dedicados; rastreável apenas pelos commits de estilo/fix do período (`c39fd34`, `3c1f2f6`,
  `49fef84`, `542a5c0`) e pela migration `202607041500_add_justification`.*
- [TASK-037/038 → REQ-022] Transferência direta de chave emprestada para outro usuário
  (com observação opcional), refletida no histórico. (ADR-004)
- [TASK-039 → REQ-023] Consolidação das 3 abas de `/logs` em visão unificada. (ADR-004)
- [TASK-040 → REQ-024] Transferência entre usuários comuns (funcionário/aluno), com
  confirmação obrigatória do destinatário. (ADR-005)
- [TASK-041 → REQ-025] Visualização e cancelamento de transferência pendente pelo
  iniciador em `/confirm`. (ADR-006)
- [TASK-042 → REQ-026] Ação de transferir chave no card mobile do Dashboard. (ADR-007)
  ⚠️ *entregue sem teste dedicado — débito técnico registrado em `plan.md`.*
- [TASK-043/044 → REQ-027] Fluxo "pull": qualquer usuário solicita diretamente ao portador
  atual a chave que está em uso; portador aceita/recusa. (ADR-008)
- [TASK-046/047 → REQ-028] Devolução forçada por porteiro/gestor/admin de qualquer chave em
  uso (antes só chaves atribuídas via bypass), com justificativa obrigatória no ato; botão
  "Devolver" explícito no card mobile. (ADR-009)
- [TASK-048 → REQ-029a] Campo único de busca+ação no Dashboard desktop (substitui os dois
  inputs gêmeos). (ADR-010)
- [TASK-049 → REQ-029b] Painel de pendências inline no Dashboard (confirmar/cancelar sem
  navegar a `/confirm`). (ADR-010)
- [TASK-050 → REQ-029c] Chips de chaves frequentes para o porteiro no mobile (frequência
  global da portaria, não só as próprias). (ADR-010)
- [TASK-051 → REQ-029d] Light mode integral — sidebar tematizada no modo claro. (ADR-010)

### Corrigido
- [REQ-028] Estados pouco claros no card mobile (quem está com a chave / quem solicitou /
  quem deve confirmar); flash de hidratação eliminado via CSS-only (`.mobile-only`/
  `.desktop-only`) em vez de detecção por JS.
- [REQ-016] Scroll horizontal na visão porteiro/desktop do Dashboard (tooltip decorativo
  vazando + botões estourando a coluna de Ações) — coberto por e2e de regressão
  (`no-horizontal-scroll.spec.ts`).

### Alterado
- [REQ-021] `withdraw_justification`/`in_use_since` expostos no SSR do Dashboard.
- Idioma único ação→cor consolidado em todas as telas (retirada = âmbar, devolução = verde,
  transferência = roxo) — `refactor(MAINT)` da One Voice Rule.

## Schema / Migration
- `db/migrations/202607041500_add_justification` — coluna `justification` na tabela de
  transações (suporte ao bypass do REQ-021). UP/DOWN pareados e testados em cópia do banco
  (gate de migration da constitution §4, cumprido).

## Risco da Release
| Nível | Critério |
|-------|---------|
| 🟢 Baixo | Apenas novas features isoladas, sem alteração de schema |
| 🟡 **Médio** | **Alteração de schema com migration, ou mudança em rota existente** |
| 🔴 Alto | Alteração em auth, multi-tenancy, pagamento, ou dados sensíveis |

**Risco desta release:** 🟡 — uma migration real no lote (coluna `justification`); nenhuma
mudança em auth, RBAC ou dado sensível. Endpoints de transação e a máquina de dupla
confirmação (REQ-003/004) não mudaram de contrato em nenhuma das sprints deste lote.

## Aceite do Cliente
N/A — uso interno, MODO EXPRESSO, cliente único (Colégio São José/UniFafire). Nenhuma demo
formal foi executada antes desta consolidação; ver detalhamento por sprint em
`.sdd/memory/spec.md` (seção "Aceite do Cliente"). Protocolo de aceite passa a ser aplicado
de fato a partir do próximo ciclo, antes do próximo merge em `main`.

## Débitos conhecidos (não bloqueantes)
- TASK-042 (REQ-026) sem teste dedicado.
- `keys.db` ainda rastreado no git (constitution §4.5) — pendente `git rm --cached` + `.gitignore`.
- `docs/tasks-sprint-N.md` sem arquivamento desde a Sprint 8 (fonte de verdade íntegra em `.sdd/memory/tasks.md` + git log).

## Plano de Rollback
- **Trigger:** erro em produção nos fluxos críticos (spec §4) — login, retirada, confirmação,
  devolução — ou `npm audit` acusando CVE HIGH/CRITICAL pós-deploy.
- **Passos:**
  1. Reverter o merge em `main` (revert do PR) → novo deploy PM2 a partir do commit anterior
     (`e873796`, baseline v0.1.0).
  2. Rollback da migration: `node db/migrate.mjs down 202607041500_add_justification`
     (script local — sem Prisma neste projeto; ver `db/migrations/*.down.sql`).
  3. Confirmar com a portaria que os 4 fluxos críticos voltaram ao comportamento anterior.
- **Tempo estimado de rollback:** < 15 min (instância única PM2, sem migração de dados
  além da coluna `justification`).

## Pendências antes do deploy real
- Push da branch de trabalho + abertura de PR contra `main`.
- Confirmar que as branches soltas `feature/sprint-10-*` a `feature/sprint-13-*` já estão
  totalmente contidas na branch atual (ou consolidar) antes do merge — evitar perder commits.
- `npm audit` e Semgrep limpos no PR (gate padrão da constitution §6).
