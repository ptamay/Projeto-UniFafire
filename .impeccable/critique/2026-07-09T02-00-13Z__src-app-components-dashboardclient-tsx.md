---
target: Dashboard (mobile+desktop) — re-critica pos P0+P1
total_score: 30
p0_count: 0
p1_count: 3
timestamp: 2026-07-09T02-00-13Z
slug: src-app-components-dashboardclient-tsx
---
# Re-crítica de Design — Dashboard (pós polish/adapt/harden)

Method: dual-agent (A: design review com inspeção viva autenticada — porteiro/aluno, 1280+375, dark+light · B: detector CLI + injeção headless em 5 páginas). Baseline anterior: 22/40.

## Design Health Score — 30/40 (Good)

| # | Heurística | Nota | Evidência |
|---|---|---|---|
| 1 | Visibilidade do status | 3 | Polling+toasts+aria-live; falta skeleton (spinner central em /confirm) |
| 2 | Sistema ↔ mundo real | 3 | PT-BR natural; "Sistema Administrativo" é preenchimento |
| 3 | Controle e liberdade | 3 | Cancelar em todo lugar, Esc; foco não devolvido ao gatilho pós-modal |
| 4 | Consistência e padrões | 3 | Idioma ação→cor unificado; dashboard fora do padrão .table; Devolver azul/ghost |
| 5 | Prevenção de erros | 3 | Dupla confirmação, validações; Enter aciona sugestão[0] silenciosamente |
| 6 | Reconhecimento > memória | **4** | Tudo visível/rotulado; frequência; contexto repetido. Excelente |
| 7 | Flexibilidade e eficiência | 3 | QA bar teclado real; sem atalho global; QA ausente no mobile porteiro |
| 8 | Estética e minimalismo | 3 | Calmo; pill de status no rodapé do card mobile; tags 10,4px |
| 9 | Recuperação de erros | 3 | Mensagens acionáveis; algumas genéricas |
| 10 | Ajuda e documentação | 2 | Card dispensável + tooltips; nada além |
| **Total** | | **30/40** | Good — fundação sólida |

Carga cognitiva: 1 falha em 8 (era 4/8) — hierarquia do card mobile "em uso" (status por último: título y=404 → botões y=532 → tag y=594).

## Veredito

Saiu da zona de slop: tokens disciplinados, combobox WAI-ARIA real, empty states que ensinam, focus rings, reduced-motion. Tells restantes = tema aplicado pela metade + layout por acidente:
1. **[P1] Badges de papel ilegíveis no light mode dentro da sidebar dark** — .light-mode .badge-porteiro #1d4ed8 sobre sidebar fixa #0F172A = 2,2:1 (a sidebar não muda de tema, os badges mudam). Fix: escopar .light-mode .sidebar .badge-* para manter a paleta dark.
2. **[P1] Status pill cai DEPOIS dos botões no card mobile "em uso"** (efeito do flex-wrap) — o dado mais escaneável vira rodapé e muda de posição conforme o estado. Fix: slot fixo título+tag no topo.
3. **[P1] "EM USO" light = 4,01:1** — #e11d48 sobre bg rosa COMPOSTO (o comentário do CSS mediu contra branco puro). Fix: rose-700 #be123c (≈5,3:1).
4. **[P2] Foco morre no body ao fechar o modal** — quebra a sequência de 10 registros seguidos do porteiro e o padrão APG. Fix: guardar activeElement ao abrir, restaurar no fechamento.
5. **[P2] Login hardcoded light-mode** num produto dark-first (login/page.tsx:49) — primeira tela do turno noturno é a mais brilhante do balcão. Fix: respeitar tema salvo ou documentar a exceção.
P3: Devolver = btn-blue desktop / ghost mobile.

## Evidência determinística (B)

CLI: 11 findings (eram 59) — 2 layout-transition (sidebar margin/width — real, debt p/ optimize), 3 micro-raios (scrollbar 3px, barra ativa 4px, indicador 3px — intencionais), 6 rgba(0,0,0,x) de sombra/scrim (FP). Injeção viva (headless, sem aba [Human]): dashboard desktop 11 hits — brancos sobre verdes claros (#fff/#45c47a 2,2:1; #fff/#28a35c 3,2:1 ×2 — avatares/decoração), text-muted/bg-elevated 4,0:1 ×2, dark-glow ×2 (nav ativa), line-length 132ch, e "arial 39% do texto" — provável artefato do "Inter Fallback" do next/font (fallback ajustado baseado em Arial); verificar. /login: tiny-text 11,2px + hierarquia achatada (1.4:1) — intocado nesta rodada.

## Convergência A+B

- Verde decorativo com branco (avatares, One Voice Rule) — A qualitativo, B mediu 2,2–3,2:1.
- layout-transition da sidebar: CLI + live + A (débito aceito → optimize).
- Light mode meio-aplicado: A mediu badge 2,2:1 e EM USO 4,01:1; B só rodou dark — cobertura complementar.

## Pontos fortes

1. UserSelector combobox de verdade (aria-activedescendant, useId, foco devolvido) — raro até em produto comercial.
2. Tokens semânticos com dupla paleta consciente; color-mix+currentColor nas tags.
3. Empty states que ensinam com CTA por papel.

## Medições-chave

Contraste dark: DISPONÍVEL 6,17 ✓ · EM USO 4,45 ⚠ raspando · badge PORTEIRO 4,77 ✓ · btn-green 4,97/8,41 ✓ · btn-blue 9,81 ✓. Light: DISPONÍVEL 4,90 ✓ · EM USO 4,01 ✗ · badge sidebar 2,20 ✗ · subtítulo 4,34 ⚠. Touch 375px: card 117×44 ✓ · chips 169×44 ✓ · bottom nav 56 ✓ · checkbox bypass 15,5×16 ✗ (label mitiga). Teclado: combobox ✓ · modal foco inicial ✓ Esc ✓ · foco pós-modal = body ✗. Overflow: 0 em todas as combinações.

## Perguntas

1. Qual é O caminho do registro no desktop (QA bar × seletor na linha)? E por que a QA não existe no mobile do porteiro?
2. O modo claro é tema ou exceção? (sidebar dark, login light, badges quebrados = três decisões convivendo)
3. Se "Informação é a Interface", por que o estado da chave é o menor texto e o último elemento do card?
