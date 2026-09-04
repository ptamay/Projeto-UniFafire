# tasks.md — Micro-spec da Sprint Ativa (Sprint 15 · 🟡 padrão)

> REQ-030 (ADR-011) — Melhorias de Dashboard UX: Ordem de Abas Prioritárias.
> Somente refatoração UI no `DashboardClient.tsx`. API e máquina de estados não mudam.
> Canal recomendado: Antigravity · Modelo: Gemini Pro · Esforço: baixo.

## TASK-052: Ordem de abas prioritárias no Dashboard (REQ-030)
**Contexto**: O Dashboard possui 4 abas, e "Minhas chaves" (filtro `mine`) recém introduzida fica escondida ou em segundo plano. Para funcionários/alunos, "Minhas chaves" deve ser a aba principal e selecionada por padrão, seguida de "Disponíveis", "Em uso", "Todas". Para quem não vê "Minhas chaves" (portaria), mantém-se "Disponíveis", "Em uso", "Todas" (e "Disponíveis" como padrão).

**Critérios BDD**:
- [x] **Cenário**: Aba "Minhas chaves" é a primeira e a padrão para usuários comuns
      Dado que o usuário logado tem a permissão `hasMyKeysTab` (ou seja, é um papel que não seja Portaria, como Funcionario/Aluno)
      Quando ele acessa o Dashboard
      Então as abas são exibidas na ordem "Minhas chaves", "Disponíveis", "Em uso", "Todas"
      E a aba "Minhas chaves" (filtro `mine`) vem ativada por padrão ao carregar.
- [x] **Cenário**: Ordem padrão e aba padrão para a portaria
      Dado que o usuário logado não possui a aba "Minhas chaves" (Porteiro)
      Quando ele acessa o Dashboard
      Então a aba "Minhas chaves" não é exibida
      E as abas são exibidas na ordem original "Disponíveis", "Em uso", "Todas"
      E a aba "Disponíveis" vem ativada por padrão ao carregar.
- [x] **Cenário** (regressão e2e/unit): Troca de abas continua funcionando
      Dado que o usuário logado (qualquer) carrega o dashboard
      Quando ele clica em "Todas" ou "Disponíveis"
      Então o estado do filtro atualiza e a lista exibe as chaves correspondentes.
- [x] **Cenário** (Mobile): Layout de tabs mobile respeita a nova ordem
      Dado que um funcionário acessa o sistema pelo mobile
      Quando as abas são renderizadas na interface mobile
      Então "Minhas" continua sendo a primeira e a padrão.
