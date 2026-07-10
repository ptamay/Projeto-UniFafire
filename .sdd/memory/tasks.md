# tasks.md — Micro-spec da Sprint Ativa (Sprint 14 · 🟡 padrão)

> REQ-029 (ADR-010) — Fluxo de registro unificado e clareza de pendências no Dashboard
> + light mode integral. **Somente UI + uma query de métrica** — a máquina de dupla
> confirmação (REQ-003/004) e os endpoints de transação não mudam. Sem migration.
> E2E smoke bloqueante (toca o fluxo crítico de retirada, spec §4).
> Canal aceito: Claude Code · Modelo: Fable 5 (≥ Opus 4.8) · Esforço: médio-alto.
> Fatias verticais, TDD atômico (test red → green → refactor por task).

## TASK-048: Busca = Ação Rápida — campo único no desktop (REQ-029a)
**Contexto**: A barra de controle desktop tem dois inputs gêmeos (busca que filtra + Ação
Rápida que registra). Passam a ser UM campo: digitar filtra a lista em tempo real E alimenta
as sugestões; Enter age na sugestão ativa. O seletor por linha permanece como caminho de mouse.
O passo 2 ("Para quem?"), o aria-live e a navegação por setas existentes são preservados.

**Critérios BDD**:
- [x] **Cenário**: Um único campo na barra de controle desktop
      Dado o Dashboard desktop (qualquer papel)
      Quando a barra de controle renderiza
      Então existe exatamente UM campo de texto (busca+ação) — o input de busca separado não existe mais.
- [x] **Cenário**: Digitar filtra a lista em tempo real
      Dado chaves "Lab 1" e "Sala 2" na lista
      Quando o usuário digita "lab" no campo único
      Então a lista abaixo exibe apenas "Lab 1" (mesmo comportamento da busca antiga).
- [x] **Cenário**: Enter age na sugestão ativa (retirada)
      Dado o porteiro digitou o nome de uma chave disponível
      Quando pressiona Enter (com a sugestão ativa ou a primeira sugestão)
      Então o fluxo de retirada abre (passo "Para quem?" no desktop), como a Ação Rápida hoje.
- [x] **Cenário**: Enter em chave em uso abre a devolução
      Dado o porteiro digitou o nome de uma chave em uso
      Quando pressiona Enter
      Então o modal de devolução abre (comportamento atual da Ação Rápida preservado).
- [x] **Cenário** (e2e desktop): retirada completa só por teclado pelo campo único
      Dado o porteiro logado no desktop
      Quando registra uma retirada usando apenas o teclado no campo único (digitar chave → Enter → digitar pessoa → Enter → Enter no modal)
      Então a pendência é criada — e a busca da lista continua funcionando no mesmo campo.

## TASK-049: Pendências inline no Dashboard (REQ-029b)
**Contexto**: A pendência nasce no Dashboard mas só é vista/concluída em `/confirm` (Context
Switch). Um painel compacto no topo do Dashboard lista as pendências do usuário (portaria vê
todas) com ações de confirmar/aceitar/cancelar, reutilizando os endpoints existentes
(`/api/transactions/pending`, `/{id}/user-confirm`, `/{id}/cancel`). `/confirm` permanece
como visão completa e destino da bottom-nav (badge continua).

**Critérios BDD**:
- [x] **Cenário**: Pendência aparece no Dashboard sem trocar de tela
      Dado que uma retirada pendente foi criada para o usuário X
      Quando X abre (ou já está com) o Dashboard
      Então um painel de pendências exibe a transação (chave, tipo no idioma ação→cor, quem falta confirmar).
- [x] **Cenário**: Confirmar pelo painel conclui a transação
      Dado uma pendência de retirada aguardando a confirmação do usuário logado
      Quando ele confirma pelo painel inline
      Então a transação usa o endpoint `user-confirm` existente e a chave muda de estado na lista — sem navegar.
- [x] **Cenário**: Cancelar pelo painel remove a pendência
      Dado uma pendência do usuário logado
      Quando ele cancela pelo painel inline
      Então o endpoint `cancel` é usado e o painel/lista atualizam.
- [x] **Cenário**: Sem pendências, sem painel
      Dado que não há pendências visíveis ao usuário
      Então o painel não ocupa espaço no Dashboard.
- [x] **Cenário** (regressão): `/confirm` e o badge da bottom-nav continuam funcionando
      Dado uma pendência criada
      Então `/confirm` a exibe como hoje e o badge conta corretamente.

## TASK-050: Chips de chaves frequentes para o porteiro no mobile (REQ-029c)
**Contexto**: Os chips de 1 toque são exclusivos de não-porteiros; para o porteiro,
"frequente" = chaves mais movimentadas da portaria (todas as retiradas, não as próprias).
Pequena extensão do endpoint `/api/metrics/frequent-keys` (sessão validada, prepared
statement, sem schema novo) + remoção do gate de papel na UI.

**Critérios BDD**:
- [x] **Cenário** (API): frequência da portaria para papéis da portaria
      Dado um porteiro autenticado e histórico de retiradas de vários usuários
      Quando chama `/api/metrics/frequent-keys`
      Então recebe as chaves mais retiradas GLOBALMENTE (portaria), não as próprias.
- [x] **Cenário** (API, regressão): usuário comum segue recebendo as próprias frequentes
      Dado um aluno autenticado com retiradas próprias
      Quando chama o endpoint
      Então recebe apenas as chaves que ELE mais retira.
- [x] **Cenário**: Chips visíveis para o porteiro no mobile
      Dado o porteiro no Dashboard mobile com histórico de movimentação
      Então os chips de chaves frequentes aparecem e o toque dispara o fluxo existente do card (retirada/devolução).

## TASK-051: Light mode integral — sidebar tematizada (REQ-029d)
**Contexto**: No modo claro a sidebar permanece escura (decisão não documentada) — badges e
tema quebram na fronteira. Decisão do ADR-010 resolvida nesta task: **tematizar a sidebar no
light mode** com contraste AA; se o teste visual reprovar a identidade, reverter para
"dark documentado no DESIGN.md" (fallback aceito pelo ADR). O login já respeita o tema salvo.

**Critérios BDD**:
- [ ] **Cenário**: Sidebar clara no light mode com AA
      Dado o tema claro ativo
      Quando a sidebar renderiza (desktop e drawer mobile)
      Então usa superfícies claras e nav items/badges/logo passam contraste AA (medido), sem override `.light-mode .sidebar .badge-*` remanescente.
- [ ] **Cenário**: Dark mode intocado
      Dado o tema escuro (padrão)
      Então a sidebar permanece exatamente como hoje (regressão visual zero no dark).
- [ ] **Cenário**: Persistência e alternância
      Dado o usuário alterna o tema pelo toggle
      Então a sidebar acompanha imediatamente e a escolha persiste (localStorage `theme`).
- [ ] **Cenário** (doc): DESIGN.md registra a decisão
      Então o DESIGN.md documenta a sidebar tematizada (ou o fallback dark, se revertido) — fim das "três decisões convivendo".
