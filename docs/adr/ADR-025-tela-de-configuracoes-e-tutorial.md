# ADR-025 — O tutorial vira "?", o tempo real vira um ponto, e o backup mostra só o estado

- **Status:** Aceito — aprovado pelo usuário em 2026-09-10; implementação na TASK-111
- **Data:** 2026-09-10
- **Tipo de Change Request:** **C** (muda o arranjo que o ADR-018 / TASK-097 e 098 entregaram)
- **Relacionado:** ADR-018 · ADR-024 · TASK-097, TASK-098, TASK-105
- **Origem:** pedido do usuário em 2026-09-10, com captura da tela de Configurações

## Contexto

A tela de Configurações, como a TASK-097 e a 098 a deixaram:

- **"Rever tutorial" mora na caixa do logout automático.** Não tem relação com ela; foi
  parar ali porque era a caixa de "sistema".
- **O card de backup lista as execuções**, uma por dia, e empurra a página para rolar. O
  que o ADMIN precisa ali é saber se o backup está em dia — e, com o ADR-024, configurá-lo.
- **"Atualização em tempo real" ocupa um card inteiro**, com o mesmo peso visual das
  configurações, para exibir um estado que quase sempre é "Ativa".
- **O tutorial só é alcançável em Configurações** — tela que, pela §3.2, só ADMIN e
  GESTOR abrem. Quem mais precisa rever o tutorial (PORTEIRO, ALUNO) não tem como.

## Decisão

1. **Botão "?" no cabeçalho**, ao lado do nome do usuário: abre o tutorial do papel de
   quem está logado, de qualquer tela, para todos os papéis. O "Rever tutorial" sai de
   Configurações.
2. **O tempo real vira um ponto na barra lateral** — verde quando assinado, amarelo no modo
   de espera (polling de 30 s) — com o detalhe no tooltip. O card sai de Configurações. O
   ponto lê o estado da assinatura **compartilhada** (TASK-105): não abre outro WebSocket.
3. **O card de backup mostra só o estado**: o último backup (quando, verificado ou não) e a
   confiabilidade dos últimos 30 dias, sem lista rolável. As configurações do ADR-024
   entram nele quando existirem.

## Consequências

- Duas guardas existentes mudam de forma, e é previsto: o cenário da TASK-098 que exige o
  botão de rever tutorial **em Configurações** passa a exigi-lo no cabeçalho; o da
  TASK-097 que exige o estado do tempo real **na tela de Configurações** passa a exigi-lo
  na barra — continuando a proibir segunda assinatura.
- O "?" é visível para todos os papéis — o tutorial já era por papel (TASK-098).
- Nenhuma mudança de dado ou de rota.

## Implementação

- **TASK-111** — as três mudanças, com as guardas ajustadas e verificação no navegador,
  inclusive no celular (o cabeçalho e a barra têm arranjo próprio lá).
