---
target: Dashboard (mobile+desktop) — reformulação UI/UX
total_score: 22
p0_count: 2
p1_count: 3
timestamp: 2026-07-08T20-12-25Z
slug: src-app-components-dashboardclient-tsx
---
# Crítica de Design — Dashboard (Sistema de Gestão de Chaves)

Method: dual-agent (A: design review · B: detector + browser evidence). Telas autenticadas: análise de código + cálculo WCAG determinístico sobre os pares exatos de cor (lockout impediu screenshot autenticado); /login inspecionado ao vivo (desktop + mobile).

## Design Health Score

| # | Heurística | Nota | Problema-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 2 | Sem skeletons; Keys/Users/History usam alert() bloqueante; "Aguardando" não diz o quê/quem falta |
| 2 | Sistema ↔ mundo real | 3 | PT-BR de domínio correto; subtítulo "Sistema Administrativo" não informa nada |
| 3 | Controle e liberdade | 2 | Enter global confirma modal de qualquer campo; sem undo |
| 4 | Consistência e padrões | 1 | 4 controles de "escolher pessoa"; alert vs toast; cor de "retirada" muda 3× entre telas; ✓/✕ unicode vs SVG |
| 5 | Prevenção de erros | 2 | Dupla confirmação + justificativa são ótimos; botões 28px lado a lado convidam mis-tap |
| 6 | Reconhecimento > memória | 3 | Nav rotulada, frequentes, autocomplete; concluir exige lembrar da aba Confirmações |
| 7 | Flexibilidade e eficiência | 3 | QA bar com teclado é rápida; sem atalho '/' nem bulk |
| 8 | Estética e minimalismo | 2 | Busca + QA + filtros + seletor por linha competindo; verde diluído em decoração |
| 9 | Recuperação de erros | 2 | Erros crus no toast; alert() sem causa nem ação |
| 10 | Ajuda e documentação | 2 | Banner dispensável bom; nada além |
| **Total** | | **22/40** | Aceitável — melhorias significativas necessárias |

## Veredito Anti-Patterns

Usuário fluente em Linear/Notion/Stripe pausaria em quase todo componente. Tells: 151 style={{}} inline no DashboardClient (12 font-sizes num arquivo; DESIGN.md define 5); tokens inexistentes --purple-100/400/600 → ícone do modal de transferência (REQ-027) invisível; cores light hardcoded em dark (EmployeesClient #334155 sobre #1E293B = 1,41:1); alert()/confirm() nativos em Keys/Users/History vs toast no Dashboard; ✓/✕/⏳ unicode nos botões mais críticos; "retirada" verde/âmbar/rosa dependendo da tela; CSS morto (.stat-card, .card-glass, .login-title) e classes fantasma (badge-funcionario/aluno); Inter carregada 2× (@import + next/font); escada z-index definida e ignorada (998/999/100/50); /login força light-mode num produto dark-first.

Detector determinístico: 59 findings — 47 design-system-color (3 legítimos em TSX: KeysClient:170 #999, Sidebar:216 #5b7ab8 propagado a 8 componentes, ConfirmClient:213/259 #10b981/#d97706; ~6 rgba(0,0,0) de sombra = ruído; parte são cores semânticas documentadas em prosa mas fora do bloco máquina do DESIGN.md), 6 overused-font Inter (falso positivo — Inter é a fonte canônica do DESIGN.md), 4 design-system-radius (3/4/12/3px fora da escala 10/14/20), 2 layout-transition (transition: margin no .main-content:211, width na sidebar:562 — jank real). Browser (headless, sem overlay visível): /login com tiny-text 11.2px e flat-type-hierarchy (7 tamanhos, ratio 1.4:1).

Convergência A+B: governança de cor quebrada (A: contrastes reprovados; B: 47 drift), tipografia sem escala (A: 12 tamanhos; B: flat-hierarchy), radius drift (ambos), animação de layout (ambos).

## Impressão Geral

Boa espinha de UX (dupla confirmação, QA bar com teclado, bottom-nav, frequentes) enterrada sob execução visual sem governança. Consertável com tokens semânticos + vocabulário único de componentes — não precisa redesign estrutural.

## Pontos Fortes

1. Acessibilidade estrutural real: :focus-visible 3px global, aria-live na QA bar, prefers-reduced-motion, safe-areas iOS.
2. Estados vazios que ensinam (cadastrar 1ª chave vs busca sem resultado, com CTA por papel).
3. Bottom-nav + modal de contatos 100% touch (60px+) — padrão certo para balcão.

## Priority Issues

- **[P0] Nomes invisíveis em /users (dark).** EmployeesClient.tsx:146-147 #334155 sobre #1E293B = 1,41:1. Fix: var(--text-primary/secondary). → /impeccable polish
- **[P0] Alvos de toque 28px no fluxo principal mobile.** globals.css:939 .key-card-action-btn min-height 28px (Devolver/Transferir/Cancelar/Solicitar) aninhados em card clicável. Viola --touch-target: 44px do próprio sistema. Fix: 44px + botões fora da área clicável do card. → /impeccable adapt
- **[P1] Modal de Transferência/Solicitação quebrado.** DashboardClient.tsx:1349-1370 usa --purple-100/400/600 inexistentes → círculo transparente; withdraw/return usam pastéis light sobre modal dark. Fix: tokens semânticos com par dark/light. → /impeccable polish
- **[P1] Idioma de cor e feedback fragmentado.** Retirada = verde/âmbar 2,75:1/rosa por tela; alert() vs toast; unicode vs SVG. Fix: mapa único ação→cor em tokens; ConfirmModal + toast em todas as telas; banir glifo unicode em botão. → /impeccable polish + /impeccable clarify
- **[P1] Becos de teclado/AT no fluxo porteiro.** UserSelector: role=option sem tabIndex/setas/aria-activedescendant — seleção impossível por teclado; .key-card é div onClick sem role/tecla; Enter global no modal. Fix: combobox WAI-ARIA (reusar lógica da QA bar), card→button. → /impeccable harden
- **[P2] Tipografia de status sob o piso.** .status-tag 10,4px uppercase com status-inuse #f43f5e 3,73:1 (token correto #fb7185 já existe e passa 5,44:1). Fix: piso 12px; usar o token. → /impeccable typeset

## Personas

**Alex (porteiro power user):** Enter global confirma errado em digitação rápida (guard 150ms é gambiarra); 2 caminhos concorrentes p/ mesma retirada; "Solicitar" disabled sem explicação; sem atalho '/' p/ QA; lista reordena sob o cursor após ação.

**Sam (acessibilidade):** UserSelector inoperável por teclado (bloqueador no desktop); .key-card invisível p/ leitor de tela; contrastes reprovados: âmbar 2,75:1 e roxo 2,03:1 no /confirm, btn-green 2,43:1 na ponta clara do gradiente, light #059669 3,77:1 (comentário no CSS alega AA — falso); significado só por cor nos ● de status.

**Casey (aluno mobile distraído):** botões 28-30px dentro de card clicável (mis-tap abre outro fluxo); chips 40px; polling triplo de 3s (bateria/3G) sem skeleton; estado do modal não sobrevive a interrupção; positivo: bottom-nav 56px na zona do polegar.

## Observações Menores

- Logout duplicado no Sidebar (dropdown + botão solto).
- Toggle de tema hand-made 32×16px — 4º padrão de switch.
- .login-error usa --status-inuse-bg em vez de --danger-bg.
- Scrollbar custom azul→verde (ban do register de produto).
- transition: all em .btn/.input/.key-card.
- Grid '1.5fr 1fr 180px 1.8fr 120px' duplicado (header 1141 / linhas 1167).
- Radius fora da escala: 12px icon-wrapper, '10px' literal, 999px vs 9999px.
- Tooltip hover-only é o único lugar que explica "Cancelar" — some no touch.
- Comentário mente: "polling de 30s" (linha 291) vs 3000ms real (linha 263).

## Medições-chave

Contraste reprovado (AA 4,5:1): /users nome 1,41:1 · /confirm roxo 2,03:1 · /confirm âmbar 2,75:1 · btn-green 2,43-3,37:1 · status-inuse 3,73:1 · light available #059669 3,77:1 · /confirm Cancelar 3,89:1 · ⏳ Aguardando 4,18:1 · text-muted/bg-elevated 4,04:1. Touch: key-card-action-btn 28px ❌ · quick-chip 40px ❌ · btn-sm 40px ❌ · bottom-nav 56px ✔ · touch-contact 60px ✔ · login 54px ✔. Contagens: 151 inline styles, 12 font-sizes/arquivo, 4 padrões seletor-de-pessoa, 3 pollings 3s, 3 vars inexistentes, 59 findings detector.

## Perguntas

1. Se a QA bar é o coração do balcão, por que divide a barra com um campo de busca gêmeo? E se a busca FOSSE a QA (um campo único que filtra e age)?
2. O porteiro precisa de duas telas para uma operação? Pendências inline no Dashboard eliminariam o Context Switch (maior falha de carga cognitiva).
3. Quem é o dono do verde? Hoje é CTA, status, logo, avatar, papel e foco — quando tudo é verde, "Solicitar" não é especial.
