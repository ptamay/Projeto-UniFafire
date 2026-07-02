# Sprint 8 — Responsividade Mobile (REQ-016 · ADR-001)

> ⚠️ Renumerada de Sprint 7 para Sprint 8 na reconciliação de 2026-07-02 (ADR-002).
> Executar APÓS a Sprint 7 — Dívida de Estabilização.

> Origem: Change Request Tipo C de 2026-07-02 (spec.md v1.1). Fontes consolidadas na Fase 9:
> backlog do `plan.md` (§4 — Sprint 8) + ADR-001. Implementação dentro do CSS nativo
> estruturado (decisão D-03 mantida), tokens do `ui-context.md`. Fluxo TDD: red → green → refactor.
>
> **Regra de negócio central:** funcionários e alunos solicitam, confirmam e devolvem
> chaves pelo celular. Todas as telas devem ser 100% funcionais em viewport ≥ 360px,
> com alvos de toque ≥ 44px nos fluxos críticos (spec.md §6).
>
> **Baseline já existente (não refazer):** `.mobile-topbar`, sidebar off-canvas e
> `.sidebar-overlay` no breakpoint 768px (`globals.css`); manifest PWA (Sprint 5);
> Playwright configurado com smoke de login em `tests/e2e/`.

**Capacidade:** 6 tasks · 14 pontos (limite: 10 tasks / 16 pts) ✓

---

## TASK-023: Fundação responsiva — breakpoints e shell mobile consolidados
- **Tipo:** Refactor
- **Critério de Aceite (BDD):**
  - [ ] **Given** o sistema aberto em viewport 360px, **When** qualquer tela autenticada é carregada, **Then** a `.mobile-topbar` aparece, a sidebar fica off-canvas e nenhum elemento gera scroll horizontal na página.
  - [ ] **Given** a sidebar aberta via topbar no mobile, **When** o usuário toca em um item de navegação ou no overlay, **Then** a sidebar fecha e a navegação ocorre.
  - [ ] **Given** os breakpoints do projeto, **When** um agente ou dev consulta `globals.css`, **Then** existe um bloco comentado único documentando os breakpoints oficiais (mobile ≤ 768px; alvo mínimo 360px) — media queries dispersas passam a referenciá-los.
  - [ ] **Given** o usuário logado no mobile, **When** abre o menu do usuário no shell (identidade de sessão, REQ-013), **Then** nome, papel e ações ficam acessíveis e tocáveis (≥ 44px).
- **Isolamento de Tenant:** N/A — sistema single-tenant, task não acessa dados.
- **Referência spec.md:** §3 REQ-016, §6
- **Referência plan.md:** Sprint 8 (backlog §4), D-03
- **Estimativa:** M
- **Dependências:** nenhuma

## TASK-024: Portador solicita/confirma pelo celular — `/login` e `/confirm` mobile-first
- **Tipo:** Refactor
- **Critério de Aceite (BDD):**
  - [ ] **Given** um funcionário/aluno acessando `/login` em viewport 360px, **When** a tela renderiza, **Then** formulário, logo e mensagens de erro cabem sem zoom nem scroll horizontal, com inputs e botão ≥ 44px de altura.
  - [ ] **Given** um portador com transação pendente acessando `/confirm` no celular, **When** a lista de pendências renderiza, **Then** cada transação aparece como card legível (chave, sala, ação, horário) com botão de confirmação ≥ 44px.
  - [ ] **Given** o portador confirma a transação no celular, **When** toca em confirmar, **Then** o fluxo completa com feedback visível (toast) e a pendência sai da lista — dupla confirmação (REQ-003/004) intacta, sem regressão nos testes de integração existentes.
  - [ ] **Given** teclado virtual aberto no mobile, **When** o usuário digita nos campos, **Then** o campo em foco permanece visível (sem ficar sob o teclado ou topbar).
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §3 REQ-016 (fluxo prioritário), REQ-003/004, §4 fluxos 2–3
- **Referência plan.md:** Sprint 8 (backlog §4)
- **Estimativa:** M
- **Dependências:** TASK-023

## TASK-025: Dashboard operacional no celular
- **Tipo:** Refactor
- **Critério de Aceite (BDD):**
  - [ ] **Given** um porteiro/gestor no dashboard (`/`) em viewport 360px, **When** a tela renderiza, **Then** os stat-cards (emprestadas vs. disponíveis, pendências) empilham em coluna única sem corte de conteúdo.
  - [ ] **Given** chaves em atraso > 12h, **When** o dashboard renderiza no mobile, **Then** o alerta visual de atraso (Sprint 6) permanece visível sem scroll horizontal.
  - [ ] **Given** as métricas de negócio no dashboard (Sprint 6), **When** visualizadas no mobile, **Then** os valores são legíveis em coluna única, sem sobreposição.
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §3 REQ-016, REQ-006, §5
- **Referência plan.md:** Sprint 8 (backlog §4)
- **Estimativa:** M
- **Dependências:** TASK-023

## TASK-026: Listagens tabela→card — `/history`, `/logs`, `/users`, `/keys`
- **Tipo:** Refactor
- **Critério de Aceite (BDD):**
  - [ ] **Given** qualquer uma das 4 telas de listagem em viewport ≤ 768px, **When** a lista renderiza, **Then** cada linha vira um card empilhado com os campos essenciais visíveis, sem scroll horizontal (padrão tabela→card do ADR-001).
  - [ ] **Given** a mesma tela em viewport > 768px, **When** renderiza, **Then** a tabela tradicional permanece (sem regressão desktop).
  - [ ] **Given** filtros, busca e paginação de cada listagem, **When** usados no mobile, **Then** todos operáveis por toque (≥ 44px) e o comportamento (incl. debounce de abas em `/logs`, Sprint 6) é preservado.
  - [ ] **Given** ações por item (editar/resetar senha em `/users`, editar chave em `/keys`, exportar PDF em `/history`), **When** acionadas no card mobile, **Then** funcionam idênticas ao desktop, respeitando RBAC (matriz da Sprint 3 sem regressão).
- **Isolamento de Tenant:** N/A — sistema single-tenant; RBAC por papel coberto pelos testes existentes.
- **Referência spec.md:** §3 REQ-016, REQ-002/005/007/010
- **Referência plan.md:** Sprint 8 (backlog §4); ADR-001 §Decisão 3
- **Estimativa:** L
- **Dependências:** TASK-023

## TASK-027: Formulários, configurações e modais destrutivos em touch
- **Tipo:** Refactor
- **Critério de Aceite (BDD):**
  - [ ] **Given** `/settings`, `/account/profile` e `/account/security` em viewport 360px, **When** o usuário edita e salva, **Then** formulários completos são operáveis sem zoom, com validação visível e controles ≥ 44px.
  - [ ] **Given** um ADMIN acionando operação destrutiva (limpar histórico / reset de banco, REQ-014) no mobile, **When** o modal de confirmação destrutiva abre, **Then** o modal cabe na tela, o texto de confirmação é legível e os botões não são acionáveis por toque acidental (confirmar e cancelar separados, ≥ 44px).
  - [ ] **Given** modais de criação/edição (usuário, chave) no mobile, **When** abertos com teclado virtual ativo, **Then** o conteúdo do modal permanece rolável e o botão de submit acessível.
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §3 REQ-016, REQ-008, REQ-013, REQ-014
- **Referência plan.md:** Sprint 8 (backlog §4)
- **Estimativa:** M
- **Dependências:** TASK-023

## TASK-028: E2E smoke mobile — 4 fluxos que não podem falhar
- **Tipo:** Chore
- **Critério de Aceite (BDD):**
  - [ ] **Given** a suíte Playwright existente (`tests/e2e/`), **When** executada, **Then** existe um projeto de configuração com viewport mobile 375×812 além do desktop.
  - [ ] **Given** o projeto mobile, **When** os smokes rodam, **Then** cobrem os 4 fluxos do spec §4: login → dashboard; retirada → confirmação pelo portador; devolução → confirmação → chave disponível; (backup verificado via teste existente da Sprint 5 — não duplicar).
  - [ ] **Given** qualquer smoke mobile, **When** um elemento essencial do fluxo estiver fora do viewport ou inacessível por toque, **Then** o teste falha (asserções de visibilidade real, não apenas presença no DOM).
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §3 REQ-015/016, §4
- **Referência plan.md:** Sprint 8 (backlog §4); backlog E2E smoke (§4)
- **Estimativa:** M
- **Dependências:** TASK-024, TASK-025, TASK-026, TASK-027

---

## Backlog — Próxima Sprint
*(nenhuma task movida por limite de capacidade)*

## Gate anti-regressão desktop (obrigatório — vale para TODAS as tasks)

> A versão desktop é a interface de trabalho da portaria e da gestão. Nenhuma task desta
> sprint pode alterá-la como efeito colateral. Regras de engenharia:

1. **CSS mobile é aditivo:** todo estilo mobile entra dentro de `@media (max-width: 768px)`
   (ou breakpoint documentado na TASK-023). **Proibido** alterar regras base (desktop) de
   `globals.css`/`page.module.css` — exceção apenas se o BDD da task exigir, com justificativa
   no commit.
2. **Markup compartilhado exige dupla verificação:** se a task alterar JSX/estrutura (não só
   CSS), o critério "Then" deve ser verificado nos dois viewports — 360px e 1280px — antes
   do commit da task.
3. **Suíte Vitest (20 testes) verde após cada task** — não apenas ao fim da sprint.
4. **TASK-028 roda os smokes E2E em DOIS projetos** (desktop 1280×800 + mobile 375×812);
   uma falha no projeto desktop é regressão e bloqueia o merge da sprint.
5. **Padrão tabela→card (TASK-026):** a tabela desktop permanece o markup primário; o card
   mobile é renderização alternativa — nunca substituição da tabela.

## Notas para o agente de execução (Antigravity)
- Carregar `ui-context.md` (task-agent, UI) — tokens, shell e primitives (`.card`, `.stat-card`, `.btn*`, `.input`).
- Nenhuma task toca schema — Gate de Migration não se aplica.
- `npm audit` limpo como gate de merge (constitution). ESLint: não introduzir NENHUM erro novo — há débito pré-existente registrado no backlog do `plan.md`; não é licença para ampliá-lo.
