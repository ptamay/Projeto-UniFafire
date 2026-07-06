# ADR-006: Visibilidade e Cancelamento de Transferências por Remetentes

## Contexto e Problema
Na Sprint 10, foi adicionada a funcionalidade de transferência de chaves iniciada por usuários comuns (REQ-024). Quando um funcionário em posse da chave inicia uma transferência (action = `transfer`), a transação é criada com o status `pending` e exige a confirmação do destinatário.
O campo `user_id` na transação reflete o *destinatário* (para quem a chave vai), e usamos o campo `porteiro_id` para armazenar o ID do remetente (quem iniciou).

O problema: A API de listagem de pendências (`/api/transactions/pending`) para usuários normais apenas filtrava por `user_id = session.id`. Como resultado:
1. O remetente não via a transação na aba de Confirmações.
2. O remetente não tinha o botão "Cancelar" (nem no Dashboard nem nas Confirmações), pois o sistema considerava que ele não fazia parte ativa daquela pendência no frontend.
Isso impedia o usuário que acidentalmente transferisse para a pessoa errada de desfazer a ação, resultando em chaves travadas aguardando a confirmação do destinatário incorreto.

## Decisão
Decidimos que:
1. A rota `/api/transactions/pending` deve retornar as pendências onde o usuário seja o destinatário (`user_id`) **OU** o remetente da transferência (`porteiro_id`).
2. O frontend (`DashboardClient.tsx` e `ConfirmClient.tsx`) deve reconhecer que o usuário é o iniciador e, caso seja, permitir a visualização e o cancelamento da transação (usando o endpoint de `/cancel` já existente, que adequadamente valida a permissão do `porteiro_id`).
3. O endpoint de `/api/keys` (`pending_info`) precisará incluir o `porteiro_id`, e o frontend deverá usar esse dado para renderizar o botão "Cancelar" apropriadamente no Dashboard.

## Consequências
- **Positivas:** O usuário que inicia o erro pode repará-lo de forma autônoma sem depender da portaria. UX alinhada ao fluxo de Retirada (onde quem pede pode cancelar).
- **Negativas:** Exposição do campo `porteiro_id` em rotas onde ele não aparecia antes (impacto nulo, já que é idêntico em funcionamento, mas exige refatoração da UI).
- **Risco:** O `porteiro_id` está sendo usado como polimorfismo ("portaria que iniciou" vs "remetente que cedeu"). Isso pode gerar confusão de nomenclatura futura se o sistema evoluir para ter mais fluxos complexos. Para agora, é a saída mais atômica e segura (DRY).
