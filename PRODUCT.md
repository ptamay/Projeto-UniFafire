# Product

<!-- impeccable:product-schema 1 -->

> Reescrito em 2026-09-14 (TASK-132 · ADR-031). O texto anterior descrevia o "Colégio São José",
> com só porteiros como usuários — a base legada, não o sistema em uso.

## Platform

web

## Users

Pessoas da **UniFAFIRE** (Centro Universitário Frassinetti do Recife) que pegam, devolvem e controlam
as chaves das salas e laboratórios. Cerca de 19 usuários ativos (medido em 2026-09-14, ADR-028), em cinco
papéis:

- **Porteiro** — opera o balcão da portaria: entrega e recebe chaves, registra quem está com qual.
  Usa o computador do balcão e o celular.
- **Funcionário** — inclui os **funcionários de apoio** (limpeza, manutenção, vigilância): pegam e
  devolvem chaves pelo celular, andando pelo campus.
- **Aluno** — pega chaves de laboratório e sala pelo celular.
- **Gestor** e **Administrador** — cadastram chaves e pessoas, veem histórico e trilha.

**Quem guia as decisões de tela** (decisão do usuário, 2026-09-14): **funcionários de apoio e
porteiros** — parte deles com pouca instrução e pouca familiaridade com tecnologia, alguns com a fonte
do celular aumentada. Se a tela funciona para eles, funciona para todos.

## Product Purpose

Saber, a qualquer momento, **quem está com cada chave** — e ter isso registrado de um jeito que não
se apaga. O sistema substitui o quadro de chaves da portaria e o caderno de anotações. Sucesso é a
chave certa sair e voltar com registro, sem fila no balcão e sem ninguém precisar interpretar a tela.

## Positioning

A retirada só vale quando **as duas pontas confirmam** — quem entrega e quem recebe (dupla
confirmação). O estado de cada chave chega aos outros aparelhos em segundos (REQ-032), e o histórico e
a trilha de auditoria não podem ser alterados nem apagados fora de um procedimento consciente
(REQ-005, REQ-014).

## Operating Context

- **Balcão da portaria:** computador, luz de interior, fila de gente esperando; o porteiro precisa
  achar a chave e registrar em segundos.
- **Pelo campus:** celular na mão, às vezes no pátio sob sol forte, às vezes com pressa entre uma
  sala e outra.
- **Ações do dia a dia:** pegar chave, devolver, passar para outra pessoa, pedir uma chave que está
  com alguém, confirmar uma retirada ou devolução pendente.
- **Rotinas:** o sistema sai sozinho às 18:30 (logout automático); há backup diário e restauração pela
  tela, só para ADMIN.
- Uso interno, em horário letivo, só em português do Brasil.

## Capabilities and Constraints

- Aplicação web (Next.js na Vercel, banco Postgres no Supabase em São Paulo), instalável na tela
  inicial pelo manifest — **sem service worker e sem modo offline** (spec §6, ADR-030).
- Cinco papéis com permissões verificadas no servidor (constitution §3.2).
- Termos do domínio: chave, sala/local, retirada, devolução, transferência, solicitação, pendência,
  confirmação, portador (quem está com a chave).
- A interface do celular tem critério de aceite próprio: REQ-033 (legibilidade e hierarquia).

## Brand Commitments

**Nenhum obrigatório** (decisão do usuário, 2026-09-14): o logo, o azul e o verde da UniFAFIRE podem
ser redefinidos em favor da leitura. O emblema existe (`public/logo/`) e pode ser usado.

## Evidence on Hand

- Dados reais em produção: chaves com nome e sala (ex.: "Chave Quimica" — "Laboratorio de Quimica"),
  pessoas, histórico e trilha.
- Cinco capturas do celular do usuário (2026-09-14), base da crítica em
  `.impeccable/critique/2026-09-14T13-04-59Z__src-app-app.md`.
- Não há depoimentos, métricas de adoção nem pesquisa com usuários — nada disso deve ser inventado.

## Product Principles

- **A tela diz o que fazer, em palavra.** Toda ação tem um verbo do dia a dia ("Pegar",
  "Devolver"); nada depende de adivinhar que algo é tocável.
- **Achar a chave vem primeiro.** A busca e a lista chegam antes de título, contador ou filtro.
- **Cor tem significado fixo.** A mesma cor quer dizer a mesma coisa em todas as telas; o vermelho é
  só para alerta e para o que apaga.
- **O que apaga fica longe do polegar.** Ação destrutiva nunca é o primeiro nem o maior botão.
- **Quem lê devagar é o público, não a exceção.** Texto grande, frases curtas, sem sigla nem jargão.

## Accessibility & Inclusion

- WCAG AA em todo componente novo (constitution) — contraste ≥ 4,5:1 no texto, também sob sol.
- Alvos de toque ≥ 44 px (spec §6, REQ-016).
- Tamanhos em `rem`: a fonte aumentada do aparelho tem de funcionar, sem cortar nem sobrepor.
- O tema segue o do aparelho na primeira visita; o botão de tema continua (REQ-033e).
- Movimento reduzido respeitado (`prefers-reduced-motion`).
