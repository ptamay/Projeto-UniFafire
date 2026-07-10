# ui-context.md — Identidade Visual e Layout Shell (UniFafire)

> Gerado na Fase 4.0 a partir do código legado (globals.css). Contexto fixo para todos os agentes de todas as sprints.
> Atualizado em 2026-07-10 após a reformulação UI/UX (Sprints polish/adapt/harden + Sprint 14,
> REQ-029/ADR-010) — ver `DESIGN.md` (raiz) para o design system completo e machine-readable.

## Assets de Marca
- Logo principal: `/public/logo` (diretório de logos identificado no legado)

## Paleta de Cores (CSS Variables Nativas)
| Token | Hex (Dark / Light) | Uso |
|---|---|---|
| `--blue-950` | #060e2a | Brand primário |
| `--blue-900` | #0F1D57 | Base de contraste |
| `--green-600` | #125930 | Brand secundário / hover |
| `--green-500` / `--green-400` | #1D8046 / #28a35c | Acentos e CTAs principais |
| `--bg-page` | #060B19 / #f1f5f9 | Fundo da aplicação |
| `--bg-card` | #1E293B / #ffffff | Fundo de cards |
| `--text-primary` | #F8FAFC / #0F1D57 | Texto principal |
| `--status-available-text` | #34d399 / #047857 | Estado "disponível" (calibrado contra o fundo tintado da tag, não a superfície pura) |
| `--status-inuse-text` | #fda4af / #be123c | Estado "em uso" (idem) |
| `--action-withdraw/return/transfer-*` | âmbar / verde / roxo | Idioma **ação→cor** (retirada/devolução/transferência) — usado em badges e acentos de registro em qualquer tela (Dashboard, Confirmações, Histórico). Nunca reutilizar cor de *estado* para nomear uma *ação* — ver "The Action Language Rule" no DESIGN.md |
| `--chip-green/blue/purple-bg/-fg` | — | Par fundo+traço dos círculos de ícone nos modais de confirmação |

**The One Voice Rule**: o verde é reservado a CTA/status positivo — nunca decoração (avatares de pessoa usam azul institucional `--blue-700`/`--blue-300`).

## Tipografia
- **Fonte:** Inter, via `next/font/google` (`--font-inter`) — **não** `@import` no CSS (removido: bloqueava o first paint e causava FOUT). Fallback `system-ui`.
- **Escala Base:** `16px`, sistema fluido. Piso de legibilidade: **12px** em qualquer texto da UI (status tags, labels, nav — nada abaixo disso, mesmo uppercase/caps).

## Layout Shell
- **Estrutura:** Sidebar com suporte a collapse.
- **Sidebar:** largura=260px (expandida) / 70px (colapsada). Colapso é **instantâneo** (sem `transition: width` — layout thrash); o drawer mobile anima por `transform`.
- **Header:** altura=70px.
- **Tema:** dark mode por padrão (`color-scheme: dark`), classe `.light-mode` para override. **A sidebar acompanha o tema** (REQ-029d/ADR-010) — no light mode usa superfície branca com texto institucional AA/AAA (`.light-mode .sidebar …`), não fica mais escura fixa. `/login` respeita o tema salvo em `localStorage.theme`.

## UI Primitives Identificados
- **Botões:** `.btn`, `.btn-green`, `.btn-blue`, `.btn-ghost`, `.btn-danger`. Hover = "Lift and Glow" (sobe + ilumina sombra, nunca clareia o fundo — preserva contraste do texto).
- **Cards:** `.card`. (`.card-glass` e `.stat-card` foram removidos — CSS morto, nunca usados.)
- **Dashboard:** `.dashboard-list-header` / `.dashboard-list-row` (grid definido uma vez, compartilhado entre cabeçalho e linhas), `.stat-chip`, `.pending-inline` (painel de pendências inline, REQ-029b), `.skeleton` (shimmer — usar no lugar de spinner central em estados de carregamento).
- **Inputs:** `.input`, `.input-label`, `.field-label`.
- **Acessibilidade:** alvo de toque mínimo `var(--touch-target)` = 44px em qualquer fluxo crítico; `UserSelector` e comboboxes seguem o padrão WAI-ARIA completo (setas, `aria-activedescendant`, foco devolvido ao gatilho); modais usam `role="dialog"` + foco inicial no botão primário + trap de Tab + restauração de foco ao fechar.
- **Design System:** Tailwind utilities + CSS puro estruturado (tokens em `:root`/`.light-mode`, componentes documentados em `DESIGN.md`).
