# ADR-009: Devolução Forçada Ampla e Clareza do Fluxo de Chaves no Mobile

## Contexto e Problema
Três lacunas foram identificadas no uso real (feedback + inspeção de código):

1. **Devolução forçada acoplada à atribuição por bypass.** O bypass da portaria (ADR-003)
   introduziu a devolução direta (sem o portador confirmar), mas a implementação só a permite
   quando a *retirada* daquela chave teve justificativa — ou seja, apenas para chaves que foram
   **atribuídas** via bypass (a devolução herda a justificativa da retirada em
   `src/app/api/transactions/route.ts`). Uma chave retirada pelo fluxo normal não pode ser
   devolvida à força pela portaria. Na prática, funcionários sem celular deixam chaves "presas":
   ninguém confirma a devolução e a portaria não consegue forçá-la.

2. **Sem botão "Devolver" no mobile.** No card mobile, uma chave em uso só oferece "Transferir"
   (portador/portaria) ou "Solicitar" (não-portador). A devolução só acontece tocando no card —
   ação não descoberta. O backend da devolução (inclusive forçada) funciona; o gap é de UI.

3. **Estados pouco claros no mobile.** O card exibe avatar + nome + "AGUARDANDO" genérico, sem
   dizer *o que* está pendente (retirada/devolução/solicitação), *quem* pediu e *quem* precisa
   confirmar.

Some-se a isto um refactor já iniciado (WIP): a responsividade do Dashboard estava baseada em
detecção de viewport por JavaScript (`window.innerWidth`), que causa flash de hidratação e um
render condicional frágil.

## Decisão
1. **Devolução forçada ampla (supersede o acoplamento do ADR-003).** Porteiro/gestor/admin podem
   forçar a devolução de **qualquer** chave em uso, independentemente de como foi retirada. A
   justificativa passa a ser **informada no ato da devolução** (obrigatória, não mais herdada da
   retirada) e a operação gera entrada no log de auditoria. Mantém-se a restrição de papel
   (apenas portaria) e a dupla confirmação continua sendo o caminho padrão para os demais.
2. **Botão "Devolver" explícito** no card mobile para o portador e para a portaria, ao lado de
   Transferir; a devolução deixa de depender do toque implícito no card.
3. **Estados claros no card mobile**: rótulo do que está pendente + quem está com a chave / quem
   solicitou / quem deve confirmar, para retirada, devolução, transferência e solicitação (pull).
4. **Responsividade por CSS** (`.mobile-only` / `.desktop-only`) em vez de detecção por JS:
   ambos os layouts são renderizados e o CSS decide a visibilidade por breakpoint (769px),
   eliminando o flash de hidratação. `suppressHydrationWarning` no `<body>`.
5. **Confiabilidade de dados**: `withdraw_justification` e `in_use_since` passam a ser expostos
   também na query SSR (`src/app/page.tsx`), não só no `/api/keys`, para o modal de devolução
   não depender de um refresh posterior.

## Consequências
- **Positivas:** a portaria resolve sozinha chaves presas de funcionários sem celular (o caso de
  negócio real); a devolução fica óbvia e auditável no mobile; os estados do card comunicam
  claramente a situação; fim do flash de hidratação.
- **Negativas / Riscos:** ampliar a devolução forçada aumenta a superfície de ação unilateral da
  portaria — mitigado por: restrição de papel, justificativa obrigatória e log de auditoria
  imutável (constitution §3.5). A dupla confirmação continua sendo o fluxo padrão; a força é a
  exceção auditável, como já era para a atribuição (ADR-003).
- **Escopo:** sem migration — a coluna `justification` já existe (ADR-003). Mudança em REQ-016
  (mobile), REQ-021 (bypass) e REQ-003/004 (devolução); registrada como REQ-028.
