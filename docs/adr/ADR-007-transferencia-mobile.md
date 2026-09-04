# ADR-007: Transferência de Chaves na Interface Mobile

## Status
Aceito (Change Request Tipo C) - 2026-07-06

## Contexto
Durante a implementação das transferências de chaves entre usuários (ADR-004 e ADR-005) e do cancelamento dessas transferências (ADR-006), as mudanças de UI no Dashboard foram aplicadas primordialmente na visualização em lista (tabela), focada em telas maiores (desktop).

O Dashboard possui uma visualização alternativa em formato de cards que é ativada em telas pequenas (modo mobile). Identificou-se que a ação de "Transferir" e, consequentemente, a exibição do status adequado de transferência pendente, ficaram ausentes nessa visualização em cards. Como o modo mobile é um requisito crucial (REQ-016), é necessário garantir a paridade de funcionalidades entre as visualizações de lista e de cards.

## Decisão
Decidimos adaptar o componente `DashboardClient.tsx` para que a visualização em cards (mobile) inclua as mesmas lógicas e ações que a visualização em lista, especificamente:
1. Exibir o status de "Aguardando" ou permitir o "Cancelar" quando o usuário for o remetente de uma transferência pendente (replicando a lógica inserida no REQ-025).
2. Adicionar o botão "Transferir" no menu de ações rápidas do card da chave quando a mesma estiver em posse do usuário.
3. Garantir que as lógicas de permissão (`isPorteiroOrAdmin` vs `userId`) sejam perfeitamente transpostas para o layout do card sem comprometer a responsividade e a UX mobile.

## Consequências

**Positivas:**
- Paridade de funcionalidades entre desktop e mobile (REQ-016).
- Ação completa e fechada de transferência (REQ-022, REQ-024, REQ-025, REQ-026) nos celulares.
- Melhoria contínua na experiência do usuário, não dependendo de dispositivos desktop para fluxos completos.

**Negativas/Riscos:**
- Aumento da complexidade do componente `DashboardClient.tsx`, que já concentra muitas lógicas condicionais de UI.
- Cuidado adicional necessário na estilização (CSS) para não quebrar o layout dos cards com novos botões/textos.
