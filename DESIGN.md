---
name: UniFAFIRE — Gestão de Chaves
description: Controle de quem está com cada chave da UniFAFIRE, no balcão da portaria e no celular.
colors:
  acao: "#9DB4FF"
  acao-hover: "#B8C8FF"
  acao-texto: "#0B1540"
  acao-claro: "#1E3A9C"
  acao-hover-claro: "#162A75"
  livre: "#34D399"
  livre-claro: "#047857"
  em-uso: "#CBD5E1"
  em-uso-claro: "#334155"
  pendente: "#F59E0B"
  pendente-texto-escuro: "#1A1200"
  pendente-fg: "#FBBF24"
  pendente-claro: "#B45309"
  pendente-fg-claro: "#92400E"
  alerta: "#DC2626"
  alerta-hover: "#B91C1C"
  alerta-fg: "#FCA5A5"
  alerta-claro: "#991B1B"
  bg-page: "#0A0F1C"
  bg-surface: "#111827"
  bg-elevated: "#1B2434"
  bg-page-claro: "#F2F4F7"
  bg-surface-claro: "#FFFFFF"
  bg-elevated-claro: "#EEF1F5"
  text-primary: "#F1F5F9"
  text-secondary: "#CBD5E1"
  text-muted: "#94A3B8"
  text-primary-claro: "#0F1D57"
  text-secondary-claro: "#3B4658"
  text-muted-claro: "#535E6E"
  borda-campo: "#64748B"
  borda-campo-claro: "#7C8699"
  branco: "#FFFFFF"
  registro-retirada: "#fbbf24"
  registro-devolucao: "#34d399"
  registro-transferencia: "#c084fc"
  registro-retirada-claro: "#b45309"
  registro-transferencia-claro: "#7e22ce"
  registro-transferencia-bg-claro: "#f3e8ff"
typography:
  tela:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
  titulo:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  texto:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  apoio:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "10px"
  md: "14px"
  lg: "20px"
  full: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
---

# Design System: UniFAFIRE — Gestão de Chaves

> **Substituído em 2026-09-14** (TASK-132 · ADR-031). O documento anterior prescrevia o visual que o
> usuário leu como "slop de IA" — botão com gradiente que sobe e brilha, sombra em todo cartão,
> rótulo em maiúsculas espaçadas — e descrevia outra instituição. Este documento tem duas camadas,
> sempre marcadas: **Em vigor** (o que o código faz hoje, e o que o hook de design confere) e
> **Contrato** (o que as TASK-134 a 136 constroem). Ao fim da TASK-136, o documento é regravado a
> partir do mundo construído. A TASK-133 (componentes globais e cor) passou de contrato a em vigor.

## 1. Direção: o quadro de chaves

**North star.** O sistema é o quadro de chaves da portaria, levado para a tela. No quadro, cada chave
tem uma plaqueta num gancho: se está no gancho, está livre; se o gancho está vazio, alguém a levou — e
todo mundo sabe ler isso de longe, sem instrução. A tela tem de ser lida do mesmo jeito.

Registro utilitário: o de um app de banco ou de transporte público. Texto grande, frases curtas,
poucas cores e sempre com significado, superfícies planas, verbos do dia a dia. Quem guia as decisões
são funcionários de apoio e porteiros, parte com pouca instrução (PRODUCT.md).

### Contrato de direção

- **THESIS:** cada chave é uma plaqueta num gancho — livre ou com alguém —, e a tela serve para achar a
  plaqueta e agir sobre ela. Recusa o painel escuro genérico de cartões com brilho e contadores.
- **OWN-WORLD:** chapa do quadro como fundo plano; a chave como linha com plaqueta (nome, sala, estado);
  cor fixa por significado — livre, em uso, pendente, alerta —, vermelho só para alerta e para o que
  apaga; um botão de ação por tela que salta aos olhos; nada de gradiente, brilho ou sombra de repouso.
- **STORY:** a pessoa abre, digita ou toca o nome da sala, vê se a chave está livre ou com quem, e
  toca o verbo ("Pegar", "Devolver", "Pedir"). Nunca precisa adivinhar o que é tocável.
- **FIRST VIEWPORT (celular, Dashboard):** barra do topo com o nome da tela; a busca como primeiro
  controle, presa ao rolar; logo abaixo, os estados como filtros ("Livres 12 · Em uso 3"); a lista de
  plaquetas começa sem rolar num aparelho de 360×640, cada linha com o verbo à direita, ao alcance do
  polegar.
- **FORM:** candidata 3 da lista fundamentada ("quadro de chaves da portaria"), sorteada pelo
  `concept-seed` do impeccable, chave **64e53132**; confirmada pelo usuário em 2026-09-14. Disciplinas
  herdadas dos desafiantes recusados: cor com significado fixo e vermelho só para alerta (teletexto);
  uma única ação que salta aos olhos por tela (bancada de hardware).
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the
  verdict, DESIGN.md, and every shipping raster carrying its provenance.

## 2. Tipografia — em vigor

**Fonte:** Atkinson Hyperlegible Next, variável, pelo `next/font` (`--font-sistema`). Desenhada pelo
Braille Institute para baixa visão: I/l/1, O/0 e a/o não se confundem. Escolha do usuário.

**Escala: cinco degraus, e nenhum outro** — tokens `--fs-1` a `--fs-5` no `globals.css`, guardados por
`tests/escala-tipografica.test.ts`. Antes eram 20 tamanhos, quase todos entre 10 e 14 px.

| Token | Tamanho | Papel |
|---|---|---|
| `--fs-5` | 28 px (1.75rem) | título da tela |
| `--fs-4` | 20 px (1.25rem) | título de seção e de cartão |
| `--fs-3` | 16 px (1rem) | texto, campo, nome — **o piso de leitura** |
| `--fs-2` | 14 px (0.875rem) | texto de apoio, rótulo de campo |
| `--fs-1` | 12 px (0.75rem) | metadado, etiqueta, rótulo da barra inferior |

**Pesos: três** — `--fw-regular` 400, `--fw-semibold` 600, `--fw-bold` 700. Negrito é para destacar;
com tudo em negrito (o 800 estava em 29 lugares), nada destaca.

Tamanhos em `rem`: a fonte aumentada do celular tem de funcionar.

**Caixa normal (em vigor desde a TASK-133):** nenhum `text-transform: uppercase` e nenhum
espaçamento de letras aberto (≥ 0,04 em) — rótulos de campo, cabeçalhos de tabela, etiquetas de
status e títulos de seção do menu estão em caixa normal. Guardado por `tests/componentes-quadro.test.ts`.

## 3. Cor — em vigor (TASK-133)

A paleta do quadro de chaves, nos dois temas. **Cor sempre por token, e cada token significa uma coisa
só, em todas as telas:**

| Significado | Token | Escuro | Claro | Onde |
|---|---|---|---|---|
| **livre** — a chave está no gancho | `--livre-fg` / `--livre-bg` | `#34D399` | `#047857` | etiqueta "Disponível", contador de livres |
| **em uso** — o gancho está vazio, alguém levou; é normal, não é alarme | `--em-uso-fg` / `--em-uso-bg` | `#CBD5E1` | `#334155` | etiqueta "Em uso" |
| **pendente** — esperando alguém confirmar | `--pendente-fg` / `--pendente-bg`, `--pendente` sólido | `#FBBF24` | `#92400E` | pendências, contadores do menu e da barra inferior, backup atrasado |
| **alerta** — atraso, erro, e o que apaga | `--alerta-fg` / `--alerta-bg`, `--alerta` sólido | `#FCA5A5` / `#DC2626` | `#B91C1C` | chaves em atraso, erros, botão de apagar, Zona de Perigo |
| **ação** — o que se toca | `--acao`, `--acao-hover`, `--acao-texto`, `--acao-bg` | `#9DB4FF` (texto marinho) | `#1E3A9C` (texto branco) | botão principal, item ativo do menu, foco, links |

- **Verde, âmbar e vermelho são o semáforo:** livre, esperando, alerta — lido sem legenda por quem tem
  pouca instrução. "Em uso" é cinza de propósito: o gancho vazio é o estado mais comum do quadro.
- **Vermelho só para alerta e para o que apaga.** "Sair" e "Cancelar" não são vermelhos (não apagam
  nada); o contador de pendências é âmbar, não vermelho.
- **A cor de ação é o azul UniFAFIRE**, a ≥ 60° de matiz de qualquer cor de estado. O verde deixou de
  ser o botão: verde agora quer dizer "livre".
- **O idioma dos registros continua** e casa com o estado que a ação produz: retirada = âmbar ·
  devolução = verde (→ livre) · transferência = roxo (`--action-*`).
- **Papéis não têm cor** (`.badge`): o papel é identidade, e seis cores de papel disputavam com as de
  estado — o âmbar do ALUNO era o âmbar de "pendente".
- Contraste AA de cada par (texto de estado sobre a etiqueta, texto sobre os sólidos, texto apagado
  sobre a página) conferido nos dois temas por `tests/componentes-quadro.test.ts`. Borda de campo com
  contraste de controle (`--borda-campo`, ≥ 3:1).

**Tema (em vigor):** na primeira visita, **segue o do aparelho** (`prefers-color-scheme`); a escolha
feita no botão de tema é gravada e vence. Aplicado por um script no `<head>`, antes da primeira pintura
(`src/lib/tema.ts`). O claro deixa de ser exceção: ele é o que abre no celular de quem está no pátio.

## 4. Superfície e elevação — em vigor (TASK-133)

Superfícies **planas**: página (`--bg-page`, a chapa), superfície e cartão (`--bg-surface` =
`--bg-card`), separados por borda de 1 px e por espaço, nunca por sombra. **Uma elevação só**,
`--elevacao`, e só no que flutua de verdade: modal, menu, lista suspensa, gaveta aberta, dica. Os
tokens `--shadow-*` saíram. Nada de brilho (sombra sem deslocamento com desfoque), nada de gradiente
(inclusive na tela de entrada, que perdeu os "orbes" de fundo).

**Nunca cartão dentro de cartão:** no celular, o cartão que embrulhava Chaves, Histórico e Logs fica
plano — a página já é a superfície. Sem faixa colorida na borda de cartão ou de linha (a de 4 px nos
cartões de chave e nas linhas do Dashboard saiu); o estado vai na etiqueta.

## 5. Componentes

**Em vigor (TASK-133):**

- **Botões:** cor sólida, sem gradiente, sem brilho, sem subir no hover. O nome diz o papel:
  `.btn-principal` (azul de ação, **48 px**, um por tela), `.btn-secundario` (contorno, 40 px),
  `.btn-ghost` (o mais discreto), `.btn-perigo` (vermelho, o que apaga), `.btn-sm` (compacto de linha,
  40 px). No celular os secundários sobem para 44 px de toque; o principal fica com 48.
- **Campos:** borda de 1 px com contraste de controle; foco em azul de ação com anel de 3 px.
- **Etiqueta de status:** caixa normal, `--fs-2` semibold, e a marca do quadro — **ponto cheio =
  livre** (a chave no gancho), **anel vazio = em uso** (o gancho vazio). Quem não distingue cor lê
  pela forma.
- **Barra do topo (celular):** o nome da tela à esquerda, junto do menu; ajuda ("?") e tema juntos na
  borda direita. O h1 da página sai da vista no celular (recortado, continua para o leitor de tela), e
  o subtítulo sai junto.
- **Barra inferior:** a aba ativa numa pílula de ação atrás do ícone; contador de pendências âmbar.
- **Menu lateral:** tokens do tema (sai o slate fixo); item ativo com fundo e texto de ação, sem
  barra colorida na borda.
- **Ícones:** SVG de traço único; os emojis 🖨️ e 🔍 viraram ícones desenhados.

**Contrato:**

- **Plaqueta da chave (TASK-134):** uma linha, não um cartão — nome em `--fs-3` semibold, sala inteira
  em `--fs-2`, estado em palavra + cor, e o verbo da ação à direita.
- **Filtros (TASK-135):** uma busca e um botão "Filtros (n)" que abre uma folha de baixo para cima; o
  primeiro registro aparece sem rolar.
- **Listas de Chaves e Usuários (TASK-136):** linha com nome, sala/papel e estado; "Remover" como ação
  secundária, com confirmação.

## 6. Faça e não faça

### Faça
- Diga a ação em palavra: "Pegar", "Devolver", "Pedir", "Passar para outra pessoa".
- Ponha a busca e a lista antes de qualquer título, contador ou filtro no celular.
- Use só os cinco tamanhos e os três pesos.
- Mantenha alvos de toque ≥ 44 px e contraste AA nos dois temas.

### Não faça
- Gradiente, brilho, "subir no hover", sombra de repouso em cartão.
- Rótulo em maiúsculas espaçadas.
- Cartão dentro de cartão.
- Vermelho fora de alerta e de ação que apaga; ação destrutiva como primeiro ou maior botão.
- Emoji no lugar de ícone.
