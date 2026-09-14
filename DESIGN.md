---
name: UniFAFIRE — Gestão de Chaves
description: Controle de quem está com cada chave da UniFAFIRE, no balcão da portaria e no celular.
colors:
  primary-action: "#28a35c"
  primary-hover: "#45c47a"
  brand-blue: "#0F1D57"
  bg-page: "#060B19"
  bg-surface: "#0F172A"
  bg-card: "#1E293B"
  text-main: "#F8FAFC"
  text-secondary: "#CBD5E1"
  border: "rgba(255, 255, 255, 0.12)"
  danger: "#ef4444"
  danger-text: "#f87171"
  warning: "#f59e0b"
  warning-text: "#fbbf24"
  status-available-text: "#34d399"
  status-inuse-text: "#fda4af"
  status-available-light: "#047857"
  status-inuse-light: "#be123c"
  action-withdraw: "#fbbf24"
  action-withdraw-light: "#b45309"
  action-return: "#34d399"
  action-return-light: "#047857"
  action-transfer: "#c084fc"
  action-transfer-light: "#7e22ce"
  chip-blue: "#8a9deb"
  chip-purple-light: "#f3e8ff"
  bg-page-light: "#f1f5f9"
  bg-elevated-light: "#f8fafc"
  border-light: "#e2e8f0"
  nav-muted: "#a8bbd8"
  badge-admin: "#a78bfa"
  badge-porteiro: "#60a5fa"
  badge-gestor: "#2dd4bf"
  badge-funcionario: "#38bdf8"
  badge-aluno: "#fbbf24"
  badge-admin-light: "#7e22ce"
  badge-porteiro-light: "#1d4ed8"
  badge-gestor-light: "#0f766e"
  badge-funcionario-light: "#0369a1"
  badge-aluno-light: "#b45309"
  badge-user-light: "#475569"
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
> **Contrato** (o que as TASK-133 a 136 constroem). Ao fim da TASK-136, o documento é regravado a
> partir do mundo construído.

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

**Contrato (TASK-133):** rótulos em caixa normal — sai o `text-transform: uppercase` com espaçamento
dos rótulos de campo, cabeçalhos de tabela e etiquetas de status.

## 3. Cor

**Em vigor:** a paleta da frente deste documento — fundo azul quase preto, superfícies slate, verde de
ação, e o idioma fixo das ações (**retirada = âmbar · devolução = verde · transferência = roxo**), com
override completo no `.light-mode`. Cor sempre por token (`var(--danger)`, `var(--status-*)`,
`var(--action-*)`), nunca literal em componente.

**Tema (em vigor):** na primeira visita, **segue o do aparelho** (`prefers-color-scheme`); a escolha
feita no botão de tema é gravada e vence. Aplicado por um script no `<head>`, antes da primeira pintura
(`src/lib/tema.ts`). O claro deixa de ser exceção: ele é o que abre no celular de quem está no pátio.

**Contrato (TASK-133):** a paleta é redefinida no mundo do quadro de chaves — nenhuma cor da marca é
obrigatória (PRODUCT.md). Regras que a nova paleta cumpre:

- **Significado fixo:** livre, em uso, pendente e alerta têm uma cor cada, a mesma em todas as telas;
  o idioma das ações continua.
- **Vermelho só para alerta e para o que apaga.** Nunca como enfeite, nunca como estado comum.
- **Uma cor de ação**, reservada ao botão principal da tela, distinta das cores de estado.
- Contraste AA nos dois temas, também sob sol.

## 4. Superfície e elevação

**Em vigor:** cartões em slate com borda de 1 px e as sombras `--shadow-sm/md/lg`.

**Contrato (TASK-133):** superfícies **planas**. Um nível de elevação só — para o que flutua de verdade
(folha inferior, menu, modal); nada de sombra de repouso em cartão. **Nunca cartão dentro de cartão**:
no celular sai o cartão que embrulha a página. Separação por espaço e por linha fina, não por caixa.

## 5. Componentes

**Em vigor:** os de antes (botões com gradiente, lift e brilho; etiquetas com bolinha brilhante) — são
os que a TASK-133 troca.

**Contrato:**

- **Botões (TASK-133):** cor sólida, sem gradiente, sem brilho, sem subir no hover (o hover não existe
  no toque). Principal com **48 px** de altura; secundários com **40 px** (44 px de área de toque
  mínima garantida por padding/área). Um principal por tela.
- **Plaqueta da chave (TASK-134):** uma linha, não um cartão — nome em `--fs-3` semibold, sala inteira
  em `--fs-2`, estado em palavra + cor, e o verbo da ação à direita.
- **Filtros (TASK-135):** uma busca e um botão "Filtros (n)" que abre uma folha de baixo para cima; o
  primeiro registro aparece sem rolar.
- **Ícones:** SVG de traço único, da mesma família; nada de emoji no lugar de ícone.
- **Barra do topo:** o nome da tela em `--fs-3`, sem repetir o título em h1 logo abaixo no celular.

## 6. Faça e não faça

### Faça
- Diga a ação em palavra: "Pegar", "Devolver", "Pedir", "Passar para outra pessoa".
- Ponha a busca e a lista antes de qualquer título, contador ou filtro no celular.
- Use só os cinco tamanhos e os três pesos.
- Mantenha alvos de toque ≥ 44 px e contraste AA nos dois temas.

### Não faça
- Gradiente, brilho, "subir no hover", sombra de repouso em cartão.
- Rótulo em maiúsculas espaçadas (sai na TASK-133).
- Cartão dentro de cartão.
- Vermelho fora de alerta e de ação que apaga; ação destrutiva como primeiro ou maior botão.
- Emoji no lugar de ícone.
