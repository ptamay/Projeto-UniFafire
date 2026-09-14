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
components:
  button-principal:
    backgroundColor: "{colors.acao}"
    textColor: "{colors.acao-texto}"
    rounded: "{rounded.sm}"
    typography: "{typography.texto}"
    height: "48px"
    padding: "6px 24px"
  button-principal-hover:
    backgroundColor: "{colors.acao-hover}"
  button-secundario:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.acao}"
    rounded: "{rounded.sm}"
    typography: "{typography.apoio}"
    height: "40px"
    padding: "6px 18px"
  button-perigo:
    backgroundColor: "{colors.alerta}"
    textColor: "{colors.branco}"
    rounded: "{rounded.sm}"
    height: "40px"
  button-remover:
    textColor: "{colors.alerta-fg}"
    rounded: "{rounded.sm}"
    height: "40px"
  campo:
    backgroundColor: "{colors.bg-page}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    typography: "{typography.texto}"
    height: "44px"
  etiqueta-livre:
    textColor: "{colors.livre}"
    rounded: "{rounded.full}"
    typography: "{typography.apoio}"
  etiqueta-em-uso:
    textColor: "{colors.em-uso}"
    rounded: "{rounded.full}"
    typography: "{typography.apoio}"
  plaqueta:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: UniFAFIRE — Gestão de Chaves

> Regravado em 2026-09-14 ao fim da TASK-136, a partir do sistema construído e medido nas
> TASK-132 a 136 (ADR-031). Os tokens da frente são normativos: são os do `globals.css`, e as
> guardas `tests/escala-tipografica.test.ts` e `tests/componentes-quadro.test.ts` conferem que o
> código não sai deles. Nada aqui é contrato por cumprir.

## Overview

**Creative North Star: "O quadro de chaves da portaria"**

O sistema é o quadro de chaves da portaria, levado para a tela. No quadro, cada chave tem uma
plaqueta num gancho: se está no gancho, está livre; se o gancho está vazio, alguém a levou — e todo
mundo lê isso de longe, sem instrução. A tela é lida do mesmo jeito: acha-se a plaqueta, vê-se se
está livre ou com quem, e toca-se o verbo.

O registro é utilitário, o de um app de banco ou de transporte público: texto grande, frases
curtas, poucas cores e sempre com significado, superfícies planas, verbos do dia a dia. Quem guia as
decisões são funcionários de apoio e porteiros, parte com pouca instrução e fonte do celular
aumentada (PRODUCT.md). O tema segue o do aparelho na primeira visita; o botão de tema grava a
escolha.

**Key Characteristics:**
- Cada item é uma LINHA com nome, apoio e estado — nunca uma tabela de "rótulo: valor".
- Toda ação tem o verbo escrito ("Pegar", "Entregar", "Devolver", "Pedir", "Passar para outra
  pessoa"); a linha em si não age ao toque.
- A busca é o primeiro controle de toda tela de lista; filtros moram em contadores ou numa folha.
- Cor por significado, a mesma em todas as telas; vermelho só para alerta e para o que apaga.
- Superfícies planas, uma elevação só, cinco tamanhos de texto, três pesos.

## Colors

Verde, âmbar e vermelho são o semáforo — livre, esperando, alerta — lido sem legenda por quem tem
pouca instrução. O azul UniFAFIRE é a ação. Cada par tem valor para o escuro (a chapa escura) e para
o claro (sufixo `-claro`), com contraste AA conferido por teste.

### Primary
- **Azul de ação** (acao / acao-claro): o botão principal da tela, o item ativo do menu e da barra
  inferior, o foco, os links. No escuro é o azul claro com texto marinho; no claro, o marinho com
  texto branco.

### Secondary
- **Verde livre** (livre / livre-claro): a chave está no gancho — etiqueta, contador de livres,
  marca de ponto cheio.
- **Âmbar pendente** (pendente, pendente-fg / pendente-claro, pendente-fg-claro): esperando alguém
  confirmar; também o contador de pendências e o backup atrasado.

### Tertiary
- **Vermelho alerta** (alerta, alerta-fg / alerta-claro): atraso, erro e o que apaga — o botão de
  perigo nos modais e na Zona de Perigo, o "Remover" como texto.
- **Idioma dos registros** (registro-retirada, registro-devolucao, registro-transferencia): no
  Histórico e nas Confirmações — retirada âmbar, devolução verde, transferência roxa —, casado com o
  estado que a ação produz.

### Neutral
- **Chapa** (bg-page / bg-page-claro): o fundo. **Superfície** (bg-surface / bg-surface-claro):
  listas, cartões de configuração, barras. **Elevado** (bg-elevated): linha em hover, cabeçalho de
  tabela, avatar.
- **Tinta** (text-primary, text-secondary, text-muted e as versões claras): no claro, o azul
  UniFAFIRE é a tinta do texto. **Em uso** (em-uso / em-uso-claro) é cinza de propósito.
- **Borda de campo** (borda-campo / borda-campo-claro): contraste de controle (≥ 3:1), mais forte
  que a borda de enfeite.

**The Semáforo Rule.** Livre é verde, pendente é âmbar, alerta é vermelho — em todas as telas, e
nenhuma dessas três cores aparece com outro sentido.

**The Red Means Delete Rule.** Vermelho só para atraso, erro e o que apaga. "Sair", "Cancelar" e
contador de pendências não são vermelhos.

**The One Action Color Rule.** O azul de ação é o que se toca e fica a ≥ 60° de matiz de qualquer
cor de estado; o verde nunca é botão.

## Typography

**Fonte:** Atkinson Hyperlegible Next, pelo `next/font`, com system-ui de reserva. Desenhada para
baixa visão: I/l/1, O/0 e a/o não se confundem.

### Hierarchy
- **Tela** (1.75rem, 700): o título da página — no celular recortado da vista, porque a barra do
  topo já diz o nome.
- **Título** (1.25rem, 700): título de seção, de modal e da folha de filtros.
- **Texto** (1rem, 400; 600 no nome da chave): o piso de leitura — nomes, campos, o botão principal.
- **Apoio** (0.875rem, 400): sala, "@usuário · papel", rótulos de campo, botões secundários,
  etiquetas de estado.
- **Meta** (0.75rem, 600): metadado curto, rótulo da barra inferior, texto de apoio sob mês e dia.

**The Five Sizes Rule.** São cinco tamanhos e três pesos (400, 600, 700), e nenhum outro — a guarda
reprova qualquer `font-size` fora dos tokens, também dentro de `<style jsx>`.

**The Normal Case Rule.** Nada em maiúsculas forçadas nem com letras espaçadas; o texto escrito em
maiúsculas no código também é pego pela E2E. Siglas curtas e o código da trilha nos Logs são a
exceção.

## Layout

- **Celular (≤ 768 px):** barra do topo fixa (nome da tela à esquerda, ajuda e tema juntos à
  direita), barra inferior com as telas principais, conteúdo com 1rem de margem. A 360×640, a busca é
  o primeiro controle e o primeiro item aparece sem rolar, em todas as telas de lista.
- **Dashboard no celular:** busca e filtros-contadores presos logo abaixo da barra do topo ao rolar;
  depois alerta, pendências, atalhos do balcão, a lista, e por último a explicação da dupla
  confirmação.
- **Histórico e Logs:** busca à vista, "Filtros (n)" abre uma folha de baixo para cima, ações num
  menu "⋯".
- **Desktop (> 768 px):** menu lateral fixo; as mesmas telas com tabela e filtros na página. O
  desktop herdou componentes e cores, sem redesenho de layout.

**The Search First Rule.** Em toda lista, a primeira coisa que se toca é a busca; título, contadores
soltos e explicações vêm depois ou saem do celular.

## Elevation & Depth

Superfícies planas. Página, superfície e cartão se separam por borda de 1 px e por espaço, nunca por
sombra. Há uma elevação só, para o que flutua de verdade: modal, menu "⋯", lista suspensa, folha de
filtros, gaveta aberta e dica. Atrás do que flutua, um véu escuro único.

**The One Elevation Rule.** Sombra em repouso não existe; brilho (sombra sem deslocamento, com
desfoque) também não. A guarda aceita só a elevação única, anel de foco e nenhuma.

## Shapes

- **Cantos:** suaves e poucos — 10 px em botões e campos, 14 px em listas e cartões, 20 px em modais
  e no topo da folha de filtros, pílula (9999 px) em etiquetas e contadores.
- **A marca do estado:** ponto cheio de 8 px = livre (a chave no gancho); anel vazio de 8 px = em uso
  (o gancho vazio). Quem não distingue cor lê pela forma.
- Sem faixas coloridas na borda de linhas ou cartões; sem gradiente.

## Components

### Buttons
- **Principal** (48 px, azul de ação, texto 1rem): um por tela — "+ Nova chave", "Novo usuário",
  "Ver resultados", o confirmar dos modais.
- **Secundário** (40 px, 44 no celular; contorno com texto azul): o verbo de cada linha — "Pegar",
  "Entregar", "Devolver", "Pedir".
- **Discreto** (contorno cinza): "Editar", "Cancelar", "Filtros", "Limpar filtros".
- **Perigo** (vermelho cheio): só no modal que confirma apagar e na Zona de Perigo.
- **Remover** (texto vermelho, sem caixa): o apagar como ação secundária numa linha.
- Nenhum botão sobe, encolhe ou brilha no hover; o recuo vertical mínimo garante que o texto nunca
  encoste na borda.

### Chips
- **Filtro-contador** ("Livres 9", "Aluno 3"): botão com a contagem dentro; o ativo é o azul de ação,
  com `aria-pressed`. Rola na horizontal no celular quando não cabe.
- **Etiqueta de estado** (pílula, apoio semibold): "Livre", "Em uso", "Aguardando", e no Histórico
  "Retirada", "Devolução", "Transferência".
- **Etiqueta de papel**: neutra — o papel é identidade, não estado.

### Cards / Containers
- **Lista de linhas** (superfície com borda, divisória entre itens): Dashboard, Chaves, Usuários,
  Histórico e Logs no celular. Nunca cartão dentro de cartão; no celular o cartão que embrulhava a
  página fica plano.
- **Cartão de configuração**: seções de Configurações, com a Zona de Perigo em moldura vermelha
  própria.

### Inputs / Fields
- 44 px de altura, borda de campo, foco com borda e anel em azul de ação. Busca com ícone de lupa
  desenhado. Mês e dia com texto de apoio embaixo ("Mostra o mês inteiro", "Ou escolha um dia só").

### Navigation
- **Barra do topo** (celular): menu, nome da tela, e à direita "?" (tutorial do papel) e tema.
- **Barra inferior** (celular): ícone de traço + rótulo; a aba ativa numa pílula de ação; contador
  de pendências âmbar.
- **Menu lateral** (desktop): item ativo com fundo e texto de ação, sem barra colorida na borda.

### Plaqueta
A assinatura do sistema: uma linha com o nome da chave (texto semibold), a sala inteira (apoio,
quebra em vez de reticências), o estado em palavra com a marca ("● Livre", "○ Com Fulano",
"Aguardando: …") e o verbo à direita, ao alcance do polegar. "Passar para outra pessoa" vem como
texto de ação embaixo, quando cabe.

## Do's and Don'ts

### Do:
- Diga a ação em palavra: "Pegar", "Entregar", "Devolver", "Pedir", "Passar para outra pessoa".
- Ponha a busca e a lista antes de qualquer título, contador ou filtro no celular.
- Use só os cinco tamanhos e os três pesos, e só os tokens de cor.
- Mantenha alvos de toque ≥ 44 px e contraste AA nos dois temas.
- Diga, no erro, o que aconteceu e o próximo passo ("Sem conexão com o sistema. Confira a internet e
  tente de novo.").

### Don't:
- Gradiente, brilho, "subir no hover", sombra de repouso em cartão.
- Rótulo em maiúsculas espaçadas, ou texto escrito em maiúsculas.
- Cartão dentro de cartão, ou tabela de "rótulo: valor" no celular.
- Vermelho fora de alerta e de ação que apaga; ação destrutiva como primeiro ou maior botão.
- Emoji no lugar de ícone.
- Linha que age ao toque sem dizer o que faz.
