# ADR-010: Fluxo de Registro Unificado e Clareza de Pendências no Dashboard

## Contexto e Problema
A re-crítica de UI/UX dual-agent de 2026-07-09 (snapshots em `.impeccable/critique/`,
Nielsen 30/40 após a rodada de fundação visual) identificou quatro fricções de **fluxo** —
todas em features já entregues, nenhuma corrigível por polish visual:

1. **Dois caminhos concorrentes para o mesmo registro (desktop).** A barra de controle tem
   dois inputs gêmeos lado a lado: a busca (filtra a lista) e a Ação Rápida (registra por
   teclado). O porteiro paga o custo da escolha em toda operação, e a tela não declara qual
   é O caminho (falha de "single focus" na análise de carga cognitiva).

2. **A operação nasce numa tela e morre em outra.** A pendência é criada no Dashboard, mas a
   confirmação/acompanhamento vive em `/confirm`. O Context Switch estrutural é a única falha
   restante de carga cognitiva e quebra a sequência de registros contínuos do balcão.

3. **O porteiro mobile é um cidadão de segunda classe.** Os chips de chaves frequentes são
   exclusivos de não-porteiros (`DashboardClient`) e a Ação Rápida não existe no mobile —
   sobra busca + toque no card, visivelmente um plano B para o papel mais intensivo.

4. **Tema claro meio-aplicado.** A sidebar permanece escura no light mode (decisão real de
   identidade, mas não documentada) e o login tinha tema próprio — três decisões diferentes
   convivendo corroem a confiança no tema (PRODUCT.md exige suporte robusto a iluminação
   variável na portaria).

## Decisão
Registrado como **REQ-029** (spec v1.9), quatro frentes, **somente UI** — a máquina de dupla
confirmação (REQ-003/004) e a API não mudam:

1. **Busca = Ação Rápida (desktop).** Um único campo que filtra a lista em tempo real e age
   no Enter (setas navegam sugestões; Enter na sugestão ativa dispara o fluxo da chave —
   retirada/devolução conforme o estado). O seletor por linha permanece como caminho
   alternativo de mouse.
2. **Pendências inline no Dashboard.** Painel no topo (visível quando houver pendências do
   usuário/da portaria) com as ações de confirmar/cancelar reutilizando os endpoints
   existentes de `/confirm`. A página `/confirm` permanece como visão completa e destino da
   bottom-nav mobile (badge continua).
3. **Aceleradores do porteiro no mobile.** Estender os chips de chaves frequentes ao papel
   PORTEIRO (frequência da portaria = chaves mais movimentadas) mantendo o fluxo de toque
   no card + modal de contatos existente.
4. **Light mode integral.** A sidebar ganha paleta clara no light mode (ou a decisão de
   mantê-la escura é assumida e documentada no DESIGN.md — decidir na sprint com teste
   visual); login já respeita o tema salvo (commit `ad7838d`'s antecessor) e isso fica
   registrado como comportamento oficial.

## Consequências
- **Positivas:** um único caminho óbvio de registro (fricção zero real), operação inteira sem
  troca de tela, porteiro mobile com paridade de aceleradores, tema coeso. Ataca diretamente
  as três "perguntas provocativas" da crítica.
- **Negativas / Riscos:** o Dashboard concentra mais responsabilidade (mitigado: pendências
  inline reusam componentes/endpoints de `/confirm`, sem lógica nova de negócio); risco de
  regressão nos fluxos de balcão — mitigado pela suíte e2e existente (key-flows, force-return,
  pull-flow, no-horizontal-scroll) que cobre exatamente esses caminhos e pelo ciclo TDD.
- **Escopo:** sem migration (nenhuma mudança de schema). Afeta REQ-021 (Ação Rápida),
  REQ-016 (mobile/tema) e a UI de REQ-003/004. Tasks TASK-048..051 no backlog (Sprint 14
  candidata). A implementação entra pelo ciclo TDD normal — nada foi implementado neste CR.
