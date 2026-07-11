# ADR-004: Transferência Direta de Chaves e Consolidação de Logs

## Contexto
Durante o uso do sistema, foram identificadas duas necessidades operacionais de melhoria:
1. **Transferência de Chaves:** Atualmente, se o Usuário A quiser repassar a chave para o Usuário B, a chave precisa ser devolvida à portaria e retirada novamente. A operação exige um fluxo onde seja possível a transferência direta com uma observação opcional, refletindo a continuidade no histórico de transações.
2. **Redundância nas Abas de Logs:** As abas existentes na página de logs de auditoria apresentam redundâncias de conteúdo e dificultam a visualização centralizada do histórico de ações, exigindo uma consolidação para otimizar a experiência do administrador.

## Decisão
Foi aprovado um Change Request Tipo C contemplando as seguintes frentes:
1. **Transferência Direta (REQ-022):** 
   - Criação de uma ação de "Transferir" aplicável a chaves que já encontram-se emprestadas.
   - O fluxo exigirá especificar o usuário de destino e permitir uma observação opcional para registro.
   - A transferência registrará a mudança de posse na tabela `key_transactions` mantendo o histórico ininterrupto e auditável.
2. **Consolidação de Logs (REQ-023):** 
   - Análise e refatoração da página de auditoria (`/logs`), unificando as informações redundantes em uma visão coesa, melhorando o uso de filtros e simplificando a interface.

## Consequências
- **Positivas:** Redução de atrito operacional e agilidade na passagem de chaves. UX mais eficiente para análise de logs por parte da administração.
- **Negativas/Riscos:** A transferência de chave exigirá cuidado especial na modelagem e atualização da tabela de transações para garantir que o tempo de empréstimo não se perca e que as queries de histórico continuem extraindo os dados corretamente. A UI de logs exigirá refatoração significativa de componentes de tabela existentes.
