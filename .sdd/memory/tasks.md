# tasks.md — Micro-spec da Sprint Ativa (Sprint 13 · 🔴 crítica)

> REQ-028 (ADR-009) — Devolução forçada ampla + clareza do fluxo de chaves no mobile.
> Sem migration (coluna `justification` já existe). Aproveita o WIP de responsividade
> CSS-driven (`.mobile-only`/`.desktop-only`). Fatias verticais, TDD atômico.

## TASK-046: API — devolução forçada de qualquer chave em uso (REQ-028)
**Contexto**: Hoje a devolução forçada (bypass) só é permitida quando a *retirada* teve
justificativa — ou seja, só para chaves atribuídas via bypass. A portaria não consegue devolver
chaves de funcionários sem celular retiradas no fluxo normal. A justificativa passa a ser
informada no ato da devolução (obrigatória), desacoplada da retirada, com log de auditoria.

**Critérios BDD**:
- [ ] **Cenário**: Portaria força a devolução de chave retirada normalmente
      Dado que a chave X está `in_use` (retirada sem justificativa/bypass)
      Quando um porteiro/gestor/admin envia `return` com `bypassConfirmation` e uma justificativa
      Então a devolução é concluída imediatamente, a chave volta a `available` (user_id nulo)
      E o histórico e o log de auditoria registram a devolução forçada com a justificativa.
- [ ] **Cenário**: Justificativa é obrigatória na devolução forçada
      Dado uma chave `in_use`
      Quando a portaria envia `return` com `bypassConfirmation` sem justificativa (ou vazia)
      Então a API rejeita (400) e a chave permanece `in_use`.
- [ ] **Cenário**: Apenas a portaria força a devolução
      Dado uma chave `in_use` com o próprio usuário comum
      Quando esse usuário comum envia `return` com `bypassConfirmation`
      Então a API rejeita (403) — força é exclusiva de porteiro/gestor/admin.
- [ ] **Cenário** (regressão): devolução forçada de chave atribuída via bypass continua funcionando
      Dado uma chave atribuída via bypass (com justificativa na retirada)
      Quando a portaria força a devolução informando uma justificativa
      Então a devolução conclui normalmente.

## TASK-047: UI mobile — botão "Devolver", devolução forçada e estados claros (REQ-028)
**Contexto**: No card mobile falta o botão "Devolver" e a devolução forçada não tem campo de
justificativa; os estados pendentes são genéricos. Consolida o refactor CSS-responsivo (WIP) e
expõe `withdraw_justification`/`in_use_since` no SSR para o modal não depender de refresh.

**Critérios BDD**:
- [ ] **Cenário**: Botão "Devolver" no card mobile
      Dado que a chave X está `in_use` e o usuário logado é o portador OU a portaria
      Quando visualiza o card no mobile
      Então há um botão "Devolver" explícito (além de Transferir/Solicitar conforme o papel).
- [ ] **Cenário**: Devolução forçada com justificativa pela portaria no mobile
      Dado que o porteiro abre a devolução de uma chave em uso
      Quando marca "confirmar sem o portador" e informa a justificativa
      Então a devolução é enviada com `bypassConfirmation` + justificativa e conclui na hora.
- [ ] **Cenário**: Estados claros no card
      Dado uma chave com retirada/devolução/transferência/solicitação pendente
      Quando visualiza o card
      Então o card diz o que está pendente e quem está com a chave / quem solicitou / quem deve confirmar.
- [ ] **Cenário** (e2e): porteiro força devolução de chave em uso pelo mobile
      Dado uma chave seedada em uso por um usuário comum
      Quando o porteiro força a devolução pelo card mobile com justificativa
      Então a chave volta a `available` — verificado no viewport mobile.
