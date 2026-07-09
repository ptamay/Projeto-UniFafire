---
name: Colégio São José - Gerenciamento de Chaves
description: Sistema interno de gestão e registro rápido de chaves na portaria.
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
  display:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
  title:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
  body:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.05em"
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
components:
  btn-green:
    backgroundColor: "{colors.primary-action}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1.5rem"
  card:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.md}"
    padding: "1.5rem"
---

# Design System: Colégio São José - Gerenciamento de Chaves

## 1. Overview

**Creative North Star: "The Efficient Concierge"**

Institucional, transmitindo a confiança e o legado do colégio com foco total na clareza de leitura. O sistema existe para um cenário de uso intensivo na portaria, onde a fricção deve ser absolutamente zero. A informação é a interface, ancorada por elementos claros e alvos de toque (touch-targets) acessíveis. O projeto prioriza o modo escuro por padrão, garantindo conforto visual, mas com um modo claro de override robusto para eventuais variações drásticas de iluminação. Rejeitamos complexidade visual, menus escondidos e adornos desnecessários.

**Key Characteristics:**
- **Zero Fricção:** Navegação direta, rápida e óbvia.
- **Tolerante ao Foco:** Interfaces calmas, com dados bem segmentados por padding e backgrounds precisos (Slate e Dark Blue).
- **Contraste Acessível:** Fundos escuros profundos contra textos de alto contraste (Off-white), minimizando a fadiga ocular do porteiro.

## 2. Colors

O sistema equilibra o "Azul Institucional Profundo" como a base imersiva de suporte e o "Verde Ação/Sucesso" para comandar interações críticas.

### Primary
- **Verde Ação/Sucesso (Green 400)** (#28a35c): Usado para botões principais, indicativos de sucesso (status available) e acentos de foco. 
- **Verde Hover (Green 300)** (#45c47a): O estado de hover ou foco para o verde principal, mais claro e vibrante, puxando a atenção imediatamente para a ação primária.

### Neutral
- **Page Background** (#060B19): Azul extremamente profundo, operando quase como um preto "suave", ideal para envelopar toda a aplicação com extremo conforto ocular no modo escuro.
- **Surface Background** (#0F172A): O famoso Slate 900, utilizado para diferenciar áreas da sidebar, topbars ou blocos principais de conteúdo, separando levemente do fundo base.
- **Card Background** (#1E293B): Slate 800, aplicado aos cards e modais para trazer a informação uma camada acima em legibilidade e hierarquia.
- **Text Main** (#F8FAFC): Off-white. Evitamos branco puro para reduzir ofuscamento em ambientes de baixa iluminação.

**The One Voice Rule.** O Verde Ação é reservado estritamente para CTAs primárias e status positivo. Jamais utilize-o como elemento decorativo sem interatividade, sob pena de diluir seu peso hierárquico na portaria.

### Semantic States (tokens)

Cores de estado têm papéis semânticos fixos — use os tokens, nunca literais soltos. Cada um tem override no `.light-mode` para manter contraste AA.

- **Danger** (`--danger` `#ef4444`, `--danger-hover`, `--danger-text` `#f87171`, `--danger-bg`): ações destrutivas (excluir), logout, badges de pendência crítica, ícones de alerta. `--danger` é fundo; `--danger-text` é texto/ícone sobre fundo escuro.
- **Warning** (`--warning` `#f59e0b`, `--warning-text`, `--warning-bg`): atenção/pendência não crítica (status "Aguardando").
- **Status: disponível** (`--status-available-text` `#34d399`, `--status-available-bg`) e **em uso** (`--status-inuse-text` `#fda4af`, `--status-inuse-bg`): indicadores de estado da chave; também usados no alerta de "chaves em atraso". Os pares foram calibrados contra o fundo TINTADO das tags (não contra a superfície pura) — AA nos dois temas.
- **Ações de registro** (`--action-withdraw-*` âmbar, `--action-return-*` verde, `--action-transfer-*` roxo): badges e acentos que nomeiam um MOVIMENTO (retirada/devolução/transferência) em qualquer tela — Confirmações, Histórico, Dashboard. Nunca reutilize cores de *estado* (em uso/disponível) para nomear uma *ação*.
- **Chips de ícone de modal** (`--chip-green/blue/purple-bg/-fg`): par fundo+traço dos círculos de ícone nos modais de confirmação; casam com a linguagem dos botões (`btn-green` retirada, `btn-blue` devolução, roxo transferência) e têm override completo no `.light-mode`.

**The Token Rule.** Vermelhos, âmbares e roxos nunca entram como hex literal em componentes — sempre `var(--danger*)` / `var(--warning*)` / `var(--status-*)` / `var(--action-*)` / `var(--chip-*)`. Isso mantém o modo claro correto e evita drift de paleta.

**The Action Language Rule.** O idioma ação→cor é fixo e vale em todas as telas: **retirada = âmbar · devolução = verde · transferência = roxo**. Botões continuam na linguagem de CTA (`btn-green` primário, `btn-blue` devolução); o idioma de ação vale para badges, tags e acentos de registro.

## 3. Typography

**Display Font:** 'Inter', sans-serif (com system-ui fallback)
**Body Font:** 'Inter', sans-serif (com system-ui fallback)

**Character:** Utilitária, neutra e altamente legível. 'Inter' é a escolha ideal para leitura densa de informações em interfaces ricas em dados e dashboards rápidos, possuindo glifos limpos em todos os pesos e excelente proporção de letras.

### Hierarchy
- **Display** (Bold 700, 1.875rem, lh 1.2): Títulos principais de páginas (ex: Dashboard, Lista de Chaves).
- **Headline** (Bold 700, 1.375rem, lh 1.2): Sub-seções de alto nível ou destaques em modais.
- **Title** (Bold 700, 1.125rem, lh 1.2): Títulos de cards, identificação de blocos (ex: Key Card Title).
- **Body** (Regular 400, 1rem, lh 1.6): Textos padrão, dados nas tabelas e instruções gerais.
- **Label** (SemiBold 600, 0.8125rem, tracking 0.05em): Utilizado em letras maiúsculas para cabeçalhos de tabela, rótulos de input, e títulos de navegação na sidebar.

**The Capital Label Rule.** Para separar metadados ou nomes de campo dos dados reais, as labels devem sempre utilizar `uppercase` e um sutil `letter-spacing` para garantir a clareza hierárquica (ex: `input-label`, `nav-section-title`).

## 4. Elevation

Hierarquia Tangível: sombras (`box-shadow`) são usadas ativamente para separar níveis físicos das superfícies. O sistema emprega sombras ricas para cards em hover, modais flutuantes e para elevar as chamadas à ação (CTAs). 

### Shadow Vocabulary 
- **Small Shadow** (`0 1px 3px rgba(0,0,0,0.4)`): O estado de descanso natural para elementos delimitados como cards de chaves.
- **Medium Shadow** (`0 4px 16px rgba(0,0,0,0.5)`): O estado de repouso para painéis elevados ou cards sob hover (ativados).
- **Large Shadow** (`0 8px 32px rgba(0,0,0,0.6)`): Exclusivo para modais que roubam o foco total da tela e barramentos que se sobrepõem massivamente ao layout.
- **Accent Glow** (`0 0 24px rgba(29,128,70,0.15)`): Usado não apenas como profundidade, mas como uma emissão de luz colorida que indica foco imediato ou interatividade em botões verdes primários.

**The Lift and Glow Rule.** Quando um elemento interativo recebe hover, ele não apenas muda de cor: ele deve literalmente subir no eixo Y (translado) e projetar uma sombra ligeiramente maior, reforçando o feedback físico (Hierarquia Tangível).

## 5. Components

Refinado e Restrito: Ações minimalistas e limpas, focadas 100% no conteúdo, mas mantendo a riqueza tátil do feedback.

### Buttons
- **Shape:** Arredondamento suave de 10px (`radius-sm`).
- **Primary (Green):** Fundo em gradiente suave verde, texto branco em 'Inter' 700 (`padding: 0.75rem 1.5rem`). Inclui box-shadow acentuado colorido.
- **Hover / Focus:** Transição de transformar levemente no eixo Y (`-2px`) e sombra que espalha e ilumina mais o elemento.
- **Ghost / Secondary:** Fundo transparente simulando o tom da página, texto contrastante, e bordas aparentes de 2px, iluminando sutilmente em hover com a cor primária verde (apenas borda e texto, nunca fundo).

### Cards / Containers
- **Corner Style:** 14px (`radius-md`).
- **Background:** Base sólida Slate 800 (`#1E293B`).
- **Shadow Strategy:** Small Shadow no estado default, escalando para Medium Shadow no hover, sempre com bordas subtis de 1px off-white translúcidas (`rgba(255, 255, 255, 0.12)`).
- **Internal Padding:** Tipicamente `1.5rem` garantindo espaço de respiro.

### Inputs / Fields
- **Style:** 10px de raio de borda (`radius-sm`), altura adequada para toque, com stroke inicial sólido cinza (`rgba(255, 255, 255, 0.24)`).
- **Focus:** Borda salta para Verde 400 com glow verde no box-shadow (`0 0 0 4px rgba(29, 128, 70, 0.15)`).

### Status Tags (Badges)
- **Style:** 9999px (full-pill), com background no tom base diluído a 8% e 12% (`rgba`) acompanhado por uma borda correspondente. Usa o prefixo de um bullet point ("dot") no lado esquerdo que simula uma "luz acesa" (`box-shadow` na própria bolinha interna).

## 6. Do's and Don'ts

### Do:
- **Do** manter botões e inputs com alturas que atinjam o `touch-target` mínimo de 44px, essencial para operações velozes na portaria.
- **Do** priorizar a tipografia Label para separar metadados dos dados brutos (uppercase, tracking maior).
- **Do** aplicar o "Lift and Glow" nos botões primários: uma transição tátil em Y acompanhada de alteração da força da sombra.

### Don't:
- **Don't** criar sistemas excessivamente complexos com menus escondidos ou dropdowns profundos que demandem muitos cliques para resolver um fluxo simples.
- **Don't** abusar do Verde Institucional como decoração passiva de backgrounds inteiros de seção; preserve-o para as ações interativas ou status positivo claro.
- **Don't** remover os indicadores de contraste ou o suporte vital ao Dark e Light modes (pois a iluminação da portaria sofre alta variação).
- **Don't** criar layouts extremamente adensados sem o devido padding nas tabelas ou cards. A leitura a 1 metro da tela demanda respiro visual.
