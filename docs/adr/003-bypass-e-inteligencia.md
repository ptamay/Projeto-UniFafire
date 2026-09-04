# ADR-003: Bypass de Dupla Confirmação e Ação Rápida Inteligente

## Contexto
Durante o uso do sistema, foi identificado que a obrigatoriedade da dupla confirmação causava gargalos ou impedia a atribuição de chaves para funcionários que não possuíam celular com acesso ao sistema no momento da retirada. Além disso, a portaria sentiu a necessidade de mais agilidade na busca por usuários frequentes para cada chave.

## Decisão
Foi implementado um fluxo de **Bypass de Confirmação** e melhorias de UI (Change Request Tipo C):
1. **Bypass Auditável**: Porteiros, gestores e administradores podem pular a dupla confirmação.
2. **Justificativa**: Ao realizar o bypass, é obrigatório informar uma justificativa (opções predefinidas ou "Outro" com texto livre), que é salva na nova coluna `justification` da tabela `key_transactions`.
3. **Listas Inteligentes**:
   - `GET /api/metrics/frequent-users`: Retorna os usuários que mais retiram uma chave específica (para portaria).
   - `GET /api/metrics/frequent-keys`: Retorna as chaves que um funcionário logado mais retira (para visão de usuário final).
4. **Usabilidade de Teclado**: Todo o fluxo de ação rápida pode ser executado apenas com `Setas` e `Enter`, assim como a confirmação dos modais.

## Consequências
- **Positivas**: Fluxo na portaria não trava por problemas técnicos/acesso do funcionário; atribuição extremamente rápida; UX adaptada para power-users de teclado.
- **Negativas/Riscos**: A dupla confirmação perde sua garantia absoluta, dependendo da política humana (justificada). O schema do banco de dados precisou ser modificado (nova coluna), mas garantimos compatibilidade retroativa e log na auditoria.
