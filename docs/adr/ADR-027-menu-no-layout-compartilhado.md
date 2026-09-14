# ADR-027 — O menu sai das páginas e vai para um layout compartilhado

- **Status:** Aceito — aprovado pelo usuário em 2026-09-14 (caminho A); **implementado na TASK-125 em
  2026-09-14**. Duas precisões da implementação: o layout lê a sessão pelo JWT (`verifySessionEdge`),
  sem ir ao banco — a checagem estrita continua na página; e o risco do nome desatualizado no menu
  não existe: o Perfil edita nome completo, matrícula e telefone, e o menu mostra o `username`.
- **Data:** 2026-09-14
- **Tipo de Change Request:** **C** (muda a estrutura de uma decisão já implementada — o esqueleto de
  carregamento da TASK-096; nenhum requisito muda)
- **Relacionado:** ADR-018/TASK-096 (esqueletos e navegação por `<Link>`) · TASK-105 (cliente
  Realtime único) · TASK-111 (ponto do tempo real e "?" no menu) · TASK-090 (guarda de papel nas
  páginas) · REQ-016 (responsividade)
- **Origem:** relato do usuário em 2026-09-14, com captura: "ao trocar de aba acontece esse fenômeno"

## Contexto

### O que o usuário viu

Ao navegar entre telas do sistema (ex.: Dashboard → Histórico), o **menu lateral some**: por um
instante a tela mostra só o esqueleto do conteúdo, com a coluna do menu vazia, e então a página
chega e o menu reaparece. No celular, a barra superior some junto.

### A causa

O menu não é compartilhado — **cada uma das nove telas desenha o próprio**:

```
HistoryClient.tsx   <div className="page-wrapper">
                        <Sidebar userRole={…} username={…} />      ← dentro da PÁGINA
                        <main className="main-content">…</main>
                    </div>
```

(o mesmo em Dashboard, Chaves, Confirmações, Logs, Usuários, Configurações, Perfil e Segurança).

Na navegação, o App Router troca o segmento da página pelo `loading.tsx` até o servidor responder —
e o menu, sendo parte da página, vai embora junto. O esqueleto (`EsqueletoDePagina`) desenha só o
`main`, corretamente; o buraco é a ausência do menu, que não está em lugar nenhum acima da página.

### O que mais isso custa, e ninguém via

Como o menu é desmontado e montado de novo a cada navegação:

- o **ponto do tempo real** volta a "Conectando…" a cada troca de tela — pelo código: o próprio
  menu assina o sinal (`useAtualizacaoDeChaves`, para o contador de pendências), e toda assinatura
  nova publica "conectando" no estado compartilhado antes de o canal responder. O estado sobrevive à
  remontagem (store do módulo), mas a assinatura do menu, recriada, o derruba. Dashboard e
  Confirmações também assinam por conta própria, e continuariam fazendo isso ao entrar — medir na
  task;
- o **timer do logout automático** (TASK-083) e o estado do **tutorial** (TASK-098) são recriados;
- a **gaveta do celular** perde o estado.

E há estado morto: seis telas passam `isOpen`/`onMobileClose` ao menu, mas **nenhuma** chama
`setSidebarOpen(true)` — a gaveta já vive dentro do menu desde a TASK-111.

## Decisão

**Caminho A, escolhido pelo usuário: o menu vai para um layout compartilhado.**

1. As telas autenticadas passam para um **grupo de rotas** `src/app/(app)/`, com um `layout.tsx`
   (Server Component) que lê a sessão e desenha a moldura — `page-wrapper`, o menu dentro de
   `.no-print` (a impressão do Histórico continua sem menu) e `{children}`. As URLs não mudam: grupo
   entre parênteses não entra no endereço. `/login` fica fora do grupo, sem menu.
2. As páginas passam a desenhar **só o `main`**. O `loading.tsx` de cada uma continua onde está e
   passa a cobrir **só o conteúdo**: o App Router não troca o layout na navegação, então o menu fica.
3. **A autorização não sobe para o layout.** Cada página continua verificando sessão E papel (§3.2,
   guarda da TASK-090): layout não roda de novo na navegação pelo cliente, então checagem só nele
   não protegeria a página seguinte. O layout lê a sessão apenas para saber o que desenhar no menu;
   sem sessão válida, não desenha nada (o `proxy.ts` já redireciona antes).
4. Sai o estado morto `isOpen`/`onMobileClose` das páginas.

### Critério de aceite

Medido no navegador, e com guarda automática:
- navegando entre telas, o elemento do menu é **o mesmo** antes e depois (não desmonta) e fica
  visível durante o esqueleto — desktop e celular;
- nenhuma página desenha `<Sidebar` — só o layout;
- numa troca entre telas que não assinam o sinal por conta própria, o ponto do tempo real não volta
  a "Conectando…"; nas duas que assinam (Dashboard, Confirmações), medir e registrar;
- a impressão do Histórico continua sem o menu.

## Alternativas consideradas

**B — esqueleto com um menu falso** (coluna cinza no lugar do menu). Rejeitada pelo usuário: some o
buraco, mas o menu ainda pisca (os itens viram barras cinza) e todo o custo de remontar continua.

**Menu no layout raiz, escondido no `/login` pela URL.** O layout raiz não sabe o caminho sem
artifício, e o `/login` passaria a depender de uma condição para não mostrar o menu. O grupo de
rotas é o mecanismo que o Next prevê para isso.

**Tirar os `loading.tsx`.** O menu não sumiria — e a tela anterior ficaria parada até o servidor
responder, que é exatamente o travamento aparente que a TASK-096 veio resolver.

## Consequências

**Positivas**
- O menu fica parado; só o conteúdo carrega.
- A assinatura do menu, o logout automático e o tutorial deixam de recomeçar a cada troca de tela.
- Menos trabalho por navegação, e uma moldura só em vez de nove.

**Negativas / riscos**
- Refatoração das nove telas e **mudança de caminho dos arquivos** (`src/app/history/…` →
  `src/app/(app)/history/…`): cerca de doze testes citam esses caminhos e mudam junto. Um
  `git mv` por pasta, para o histórico dos arquivos continuar legível.
- A impressão do Histórico, a barra superior do celular e o drawer precisam ser verificados de
  novo — por guarda e no navegador, em desktop e celular.
- O layout não roda na navegação pelo cliente: um nome de usuário alterado no Perfil só aparece no
  menu depois de um `router.refresh()` — o que a tela de Perfil já faz ao salvar (a conferir na task).

## Implementação

- **TASK-125 — menu no layout.** Grupo `(app)` com `layout.tsx`; páginas só com o `main`; estado
  morto removido; guardas (nenhuma página desenha o menu; autorização continua nas páginas) e uma
  E2E que navega e prova que o menu não desmonta; verificação no navegador, desktop e celular, e da
  impressão do Histórico.
