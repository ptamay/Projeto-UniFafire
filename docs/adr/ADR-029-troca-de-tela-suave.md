# ADR-029 — A troca de tela fica suave: a tela atual espera, a nova entra com fade

- **Status:** Aceito — aprovado pelo usuário em 2026-09-14; implementação na TASK-128
- **Data:** 2026-09-14
- **Tipo de Change Request:** **C** (desfaz parte de uma decisão já implementada — os esqueletos da
  TASK-096; nenhum requisito muda)
- **Relacionado:** ADR-018/TASK-096 (esqueletos e `<Link prefetch={false}>`) · ADR-027/TASK-125 (menu
  no layout) · REQ-016 (responsividade) · constitution §7.2
- **Origem:** relato do usuário em 2026-09-14, com capturas, depois da TASK-125 no ar: "quando troco
  a aba, parece seco demais, aí aparecem esses blocos cinzas carregando e depois aparece a página"

## Contexto

### O que o usuário vê

A cada troca de tela, dois cortes secos: o conteúdo **some de uma vez** e vira blocos cinzas; depois
os blocos **somem de uma vez** e a tela nova aparece. Nada é animado. A TASK-125 resolveu o menu (ele
já não some — medido num build de produção local: nas sete telas do ADMIN, com a resposta atrasada
em 1,5 s, o menu é o mesmo elemento e está na tela em todos os quadros de esqueleto), mas o conteúdo
continua piscando.

### Por que acontece

É o desenho da TASK-096 (ADR-018, Decisão 2): todas as telas são dinâmicas e cada uma tem um
`loading.tsx`. Na navegação, o App Router troca o conteúdo pelo esqueleto **imediatamente** (o
boundary é novo, então o React mostra o fallback na hora) e só depois pela página.

O esqueleto nasceu para resolver outro problema, e resolveu: sem ele, a tela anterior ficava
**parada e sem sinal nenhum** até o servidor responder, e a impressão era de travamento. O defeito
de agora é o custo daquela solução: o sinal de "carregando" é a destruição do conteúdo.

## Decisão

**A tela atual fica até a próxima estar pronta; o carregamento é sinalizado sem apagar nada; a tela
nova entra com um fade curto.**

1. **Saem os nove `loading.tsx`** do grupo `(app)` e o componente `EsqueletoDePagina`. Sem boundary,
   o App Router mantém a tela atual na tela durante a navegação (a transição do React não mostra
   fallback que não existe).
2. **O menu responde no clique.** Cada link de navegação (menu lateral, barra inferior do celular,
   itens da conta) leva um indicador que lê `useLinkStatus()` do `next/link`: enquanto a navegação
   daquele link está pendente, o item fica marcado como o ativo e uma **barra fina corre no topo da
   tela** (cor de destaque do sistema). A barra só aparece se a espera passar de ~100 ms — navegação
   rápida não pisca nada. É o que resolve o problema original da TASK-096 (tela parada sem sinal)
   sem o custo dela.
3. **A tela nova entra com fade + deslize de 4 px em ~200 ms**, na `.main-content`. Como cada página
   desenha o próprio `main`, o fade roda na troca de tela e **não** roda no `router.refresh()` do
   tempo real nem ao mudar filtros do Histórico (o elemento é o mesmo, o React não o recria).
4. **Quem pede menos movimento não vê animação** (`prefers-reduced-motion: reduce`): troca direta,
   barra estática.
5. **O `prefetch={false}` continua.** O motivo que a TASK-096 mediu não dependia do esqueleto: o
   `router.refresh()` a cada sinal do Realtime faria todos os links prefetcharem de novo.
6. **Navegações por botão viram link** onde são navegação de verdade (o "Cadastrar chave" do estado
   vazio do Dashboard): com `router.push` não há indicador, e sem esqueleto o clique pareceria morto.

### Critério de aceite

Medido num build de produção local, com a resposta do servidor atrasada, desktop e celular:
- durante a espera, a **tela anterior continua visível** (nenhum `main[aria-busy]`, o título antigo
  na tela), o item clicado está marcado e a barra do topo aparece;
- quando a resposta chega, a tela nova está lá, a barra some, e a `.main-content` roda a animação
  de entrada; com movimento reduzido, não roda;
- nenhuma `loading.tsx` nas telas (guarda), e todo link do menu leva o indicador (guarda).

## Alternativas consideradas

**Esqueleto só se demorar** (esconder o fallback por ~300 ms). Rejeitada: o conteúdo anterior sai na
hora do mesmo jeito — o cinza vira área **vazia**, que é outro corte seco.

**Guardar as telas vistas por 30 s** (`staleTimes.dynamic`). Voltar a uma tela recente ficaria
instantâneo, mas a primeira visita continuaria piscando, e num controle de chaves mostrar por um
instante o estado de 30 s atrás é pior que esperar 300 ms.

**View Transitions do navegador** (`experimental.viewTransition` do Next 16). Faria o cross-fade
nativo entre as telas, mas é experimental no Next e no React, e o efeito que o usuário pediu (suave,
sem cinza) sai com CSS comum. Fica como evolução possível, não como base.

## Consequências

**Positivas**
- Nenhum corte seco: a tela antiga fica, a nova entra suave.
- O clique tem resposta imediata no próprio item e, se demorar, na barra.
- Menos código: nove arquivos e um componente saem.

**Negativas / riscos**
- **Primeiro carregamento (F5, abrir o sistema) sem esqueleto:** o navegador espera o servidor
  renderizar a tela inteira antes de mostrar algo. O menu e a tela chegam juntos. Aceito pelo usuário.
- **Três telas ainda piscam por dentro** (achado na implementação): Confirmações, Logs e Usuários
  buscam os dados no navegador depois de abrir — Confirmações com cartões cinzas, as outras com
  "Carregando…". A navegação chega suave; o conteúdo delas não. A correção é entregar os dados
  iniciais pelo servidor, com autorização por papel na página (§3.2) — fica para decisão à parte.
- **Mudar filtros do Histórico** continua sem indicador (já era assim: o esqueleto não reaparece em
  mudança de query string). Fica registrado, fora deste CR.
- Uma navegação por `router.push` que sobrar (redirecionamentos de autorização em Logs e Chaves) não
  mostra indicador — são desvios, não navegação pedida pelo usuário.
- A `.main-content` ganha `transform` durante 200 ms: nesse intervalo ela é bloco de contenção para
  descendentes `position: fixed`. Nenhum modal abre na montagem da página hoje; a guarda de CSS
  confere que a animação não deixa `transform` residual.

## Implementação

- **TASK-128 — troca de tela suave.** Remove os `loading.tsx` e o `EsqueletoDePagina`; indicador com
  `useLinkStatus` em todos os links de navegação; barra no topo; fade de entrada na `.main-content`
  com `prefers-reduced-motion`; o "Cadastrar chave" do Dashboard vira link. Guardas substituem as da
  TASK-096 que exigiam `loading.tsx`. E2E nova com a resposta atrasada, desktop e celular.

## Emenda de 2026-09-14 — TASK-131: os dados iniciais vêm do servidor

Aprovada pelo usuário depois da TASK-128 no ar. A navegação ficou suave, mas **Confirmações, Logs e
Usuários** ainda piscavam POR DENTRO: abriam vazias e buscavam os dados no navegador, com cartões
cinzas (Confirmações — é a primeira captura do relato) ou "Carregando…". A tela nova precisa
chegar **com o conteúdo**.

1. A consulta sai das rotas `/api/transactions/pending`, `/api/logs` e `/api/users` para `src/lib`
   (`listarPendencias`, `listarLogs`, `listarUsuariosAtivos`). Rota e página chamam a MESMA
   função — duas cópias da consulta divergiriam, e a divergência seria silenciosa.
2. A página chama a função **depois** de verificar sessão e papel (§3.2) e entrega o resultado ao
   componente de cliente, que nasce com os dados e sem estado de carregamento. As buscas seguintes
   (tempo real, filtros, paginação) continuam pela rota.
3. **O escopo por papel fica à vista na página.** Confirmações é de todos os papéis e escopa: quem
   não opera o balcão vê só as próprias pendências — a restrição é TETO passado à função, como o
   `restritoAoUsuarioId` do Histórico (TASK-088). Sai a exceção de `/confirm` da guarda da
   TASK-090 ("não consulta no servidor" deixa de ser verdade), e a guarda passa a reconhecer as
   funções `listar*` como consulta ao banco — senão ela ficaria cega para as três páginas.
4. Datas saem em ISO da função, como saíam no JSON da rota: o componente recebe o mesmo formato
   pelos dois caminhos.

**Critério de aceite:** E2E com a resposta da navegação E as rotas de API atrasadas — do primeiro
quadro da tela nova até 2 s depois, nenhum `.skeleton` e nenhum "Carregando" dentro da
`.main-content` nas três telas; contra a `main` de antes, o mesmo spec reprova.
