# ADR-005: Transferência de Chaves entre Usuários Comuns (REQ-024)

## Contexto
O Change Request que implementou a transferência de chaves (ADR-004, REQ-022) foi projetado para operações atômicas (bypass) realizadas por administradores, gestores ou porteiros. No entanto, observou-se a necessidade de permitir que os próprios portadores da chave (funcionários e alunos) repassem a chave para outro colega sem precisar ir à portaria, o que é um fluxo operacional comum no dia a dia.

## Decisão
Foi aprovado um Change Request (Tipo C) para permitir transferências originadas por usuários sem privilégios administrativos.
Como usuários comuns não possuem poder de "atribuição direta" (bypass), essa operação exigirá **dupla confirmação**:
1. O usuário A (atual portador da chave) inicia a transferência para o usuário B.
2. É criada uma transação do tipo `transfer` com status `pending`.
3. O usuário B precisa visualizar e aceitar essa transação pendente em seu painel.
4. Após o aceite, a chave é formalmente transferida e o histórico atualizado.

## Consequências
- **Positivas:** Redução ainda maior da fila na portaria; mais autonomia para o corpo docente e discente na passagem de chaves.
- **Negativas/Riscos:** A complexidade da máquina de estados de transação aumenta. Agora, além de devoluções e retiradas pendentes, teremos transferências pendentes (onde o ator remetente não é o porteiro). A interface de "Aguardando Confirmação" precisará ser adaptada para suportar esse novo estado e garantir que chaves não fiquem travadas num limbo de transferência não aceita (permitindo cancelamento pelo remetente).
