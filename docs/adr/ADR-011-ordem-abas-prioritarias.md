# ADR-011: Ordem de Abas Prioritárias no Dashboard

**Data:** 2026-07-18
**Status:** Aceito

## Contexto

Atualmente, o Dashboard exibe as chaves de forma padronizada para todos os usuários, sendo a aba "Todas" (ou "Disponíveis") a aba central dependendo das interações. Contudo, para os usuários que não são da portaria (ex: Funcionários e Alunos), a interação com o sistema é prioritariamente para verificar e interagir com as próprias chaves, ou solicitar outras que lhes interessem. A aba "Minhas chaves" acaba ficando no fim da fila.

## Decisão

Foi requisitado (REQ-030) que, para qualquer perfil que tenha acesso ao menu "Minhas chaves", esta seja a aba prioritária (exibida primeiro e carregada como default). 

A nova ordem de abas será dinâmica baseada nas permissões do usuário logado:
- **Para quem tem a aba "Minhas chaves" (Funcionários, Alunos):**
  1. Minhas chaves (Ativa por padrão)
  2. Disponíveis
  3. Em uso
  4. Todas
- **Para quem NÃO tem a aba "Minhas chaves" (Portaria, etc):**
  O fluxo padrão original (Disponíveis, Em Uso, Todas) é mantido.

Isso implica uma alteração puramente de UI/frontend no componente `DashboardClient.tsx`, afetando a definição da ordem no estado ou mapeamento das abas para renderização, e também definir o valor inicial de qual filtro fica ativo (`useState` de filtro).

## Consequências

- **Positivas:** Redução de atrito para o funcionário que acessa o sistema majoritariamente para verificar o status de suas chaves. Acesso mais rápido às ações relevantes para o próprio perfil.
- **Negativas / Riscos:** Nenhuma grande regressão esperada, é uma refatoração pontual de um componente React, sem impacto em backend.
- **Impacto em Testes:** Os testes E2E do fluxo de Dashboard ou testes unitários de renderização que esperavam a primeira aba ser "Disponíveis" podem precisar de ajustes se forem executados com o perfil funcionário/aluno.
