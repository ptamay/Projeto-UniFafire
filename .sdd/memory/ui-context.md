# ui-context.md — Identidade Visual e Layout Shell (UniFafire)

> Gerado na Fase 4.0 a partir do código legado (globals.css). Contexto fixo para todos os agentes de todas as sprints.

## Assets de Marca
- Logo principal: `/public/logo` (diretório de logos identificado no legado)

## Paleta de Cores (CSS Variables Nativas)
| Token           | Hex (Dark/Light) | Uso                          |
|-----------------|------------------|------------------------------|
| `--blue-950`    | #060e2a          | Brand primário               |
| `--blue-900`    | #0F1D57          | Base de contraste            |
| `--green-600`   | #125930          | Brand secundário / hover     |
| `--green-500`   | #1D8046          | Acentos e CTAs principais    |
| `--bg-page`     | #060B19 / #f1f5f9| Fundo da aplicação           |
| `--bg-card`     | #1E293B / #ffffff| Fundo de cards               |
| `--text-primary`| #F8FAFC / #0F1D57| Texto principal              |

## Tipografia
- **Fonte:** Inter (importada via Google Fonts no globals.css)
- **Escala Base:** `16px`, sistema fluido.

## Layout Shell
- **Estrutura:** Sidebar com suporte a collapse
- **Sidebar:** largura=260px (expandida) / 70px (colapsada)
- **Header:** altura=70px
- **Tema:** Dark mode por padrão (CSS native `color-scheme: dark`), com classe `.light-mode` para override.

## UI Primitives Identificados
- **Botões:** `.btn`, `.btn-green`, `.btn-blue`, `.btn-ghost`, `.btn-danger`
- **Cards:** `.card`, `.card-glass`, `.stat-card`
- **Inputs:** `.input`, `.input-label`
- **Design System:** Usa Tailwind Utilities em conjunto com CSS puro estruturado.
