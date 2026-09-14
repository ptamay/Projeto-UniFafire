# ADR-031 — A interface do celular vira utilitária: escala de tipo, verbos e superfícies planas

- **Status:** Aceito — aprovado pelo usuário em 2026-09-14 (direção "utilitário claro", CR completo, tema
  seguindo o aparelho); implementação nas TASK-132 a 136
- **Data:** 2026-09-14
- **Tipo de Change Request:** **C** (muda telas já entregues — REQ-016, REQ-029, REQ-030 — e cria o
  REQ-033; a constitution não fala de interface). Troca o `DESIGN.md` e atualiza o `PRODUCT.md`.
- **Relacionado:** REQ-016 (responsividade) · REQ-029 (Dashboard, tema claro integral) · REQ-030 (ordem
  das abas) · REQ-014 (limpeza do histórico) · ADR-001 (CSS nativo) · ADR-010 (reformulação de julho) ·
  ADR-029/TASK-128 (troca de tela) · TASK-131 (dados iniciais pelo servidor)
- **Origem:** o usuário, com cinco capturas do celular (Dashboard, Chaves, Histórico ×2, Logs): "o modo
  mobile está muito ruim em UI/UX", "parece slop de IA", "não parece ter hierarquia nos textos, botões
  excessivamente grandes", "a dashboard ainda parece algo amador", "pessoas com pouca instrução irão usar"

## Contexto

### Crítica de 2026-09-14 (`.impeccable/critique/2026-09-14T13-04-59Z__src-app-app.md`)

Nota **23/40** (Aceitável) nas dez heurísticas de Nielsen; a pior é estética e minimalismo (**1/4**).
Rodada em contexto único, sem overlay no navegador (telas logadas sem banco local); evidência visual =
as capturas do usuário, cruzadas com o código.

### Medido no código

```
tamanhos de fonte em uso (CSS + TSX)   20   — o DESIGN.md define 5
font-size fora da escala (detector)   103   dos 115 achados
peso 800                                29×
style={{ }} no DashboardClient        148   — o celular é consertado por !important no globals.css
```

Quase todo texto está entre 10 e 14 px e em negrito: nada lidera. Os rótulos em MAIÚSCULAS espaçadas
chegam a 10,4 px (`0.65rem`).

### O que o usuário vê, tela a tela

- **Dashboard:** título de duas linhas, subtítulo e contadores empurram a busca para ~40% da tela. O
  cartão da chave disponível **não mostra ação** — tocar no cartão é "retirar", e nada diz isso. A sala
  chega truncada ("Laboratorio d...") com espaço sobrando.
- **Histórico:** três botões de largura cheia no topo — o primeiro é **"Limpar Histórico", vermelho** —,
  duas métricas em jargão ("Dupla confirmação 75%", "Tempo de balcão 0 min") e **seis filtros
  empilhados** antes de qualquer registro. Mês e data vazios parecem caixas quebradas. "Exportar PDF" e
  "Imprimir / Gerar PDF" fazem quase a mesma coisa.
- **Logs:** a primeira tela inteira é filtro; "Hora (0-23)".
- **Chaves:** cada chave é uma tabela de "rótulo: valor" (NOME / SALA/LOCAL / STATUS); "Remover"
  vermelho cheio, do mesmo tamanho que "Editar".
- **Em todas:** título repetido (barra do topo + h1), cartão dentro de cartão (página → caixa de
  filtros → campo), emoji misturado com ícone (🖨️, 🔍).

### A causa está escrita

O `DESIGN.md` **prescreve** o que o usuário lê como template: a "Lift and Glow Rule" (botão que sobe e
brilha no hover — sem sentido no toque), gradiente nos botões, brilho verde, sombra em todo cartão,
bolinha "com luz acesa" nas etiquetas, rótulo sempre em maiúsculas. Em julho, quatro rodadas de crítica
levaram o Dashboard de 22 para 30 pontos com correções pontuais **sobre esse mesmo visual**, e a
sensação de amador ficou. Polir de novo não resolve.

### O contexto de produto está vencido

O `PRODUCT.md` descreve o "Colégio São José" e **só porteiros**. Hoje o sistema é da UniFAFIRE, e
funcionários e alunos usam pelo celular — parte deles com pouca instrução, alguns com a fonte do
aparelho aumentada. Um redesign sobre o documento antigo repetiria o erro.

## Decisão

1. **Direção "utilitário claro"** *(decisão do usuário)* — o registro de um app de banco ou de
   transporte público: texto grande e legível, poucas cores e sempre com significado, superfícies
   planas, verbos do dia a dia. Prioriza quem tem pouca instrução sem parecer infantil. O azul e o verde
   da UniFAFIRE continuam, como identidade e não como enfeite.
2. **Primeiro o contexto, depois o visual.** O `PRODUCT.md` é reescrito (UniFAFIRE, os cinco papéis,
   celular, baixa escolaridade) e o `DESIGN.md` é **substituído**, não emendado: sai a Lift and Glow Rule,
   saem gradiente, brilho e sombra de repouso; entram uma escala de 5 tamanhos no celular
   (12 · 14 · 16 · 20 · 28 px), três pesos (400 · 600 · 700), rótulos em caixa normal, um nível de
   elevação, botão principal de 48 px e secundários de 40 px.
3. **A escala vira regra verificável.** Uma guarda reprova tamanho de fonte fora dos tokens da escala —
   hoje o detector acusa 103, e o `DESIGN.md` sozinho nunca impediu nenhum.
4. **O tema segue o aparelho na primeira visita** *(decisão do usuário)* — claro ou escuro conforme o
   celular; o botão de tema continua e a escolha salva continua valendo. Quem usa no pátio, no sol, não
   fica preso ao escuro. O escuro deixa de ser o padrão absoluto que o DESIGN.md antigo fixava para a
   portaria; o desktop da portaria segue a mesma regra.
5. **Cada chave mostra a sua ação em palavra.** "Pegar", "Devolver", "Pedir", "Passar para outra
   pessoa" — nenhuma ação depende de saber que o cartão inteiro é tocável.
6. **Filtro não ocupa a tela.** Histórico e Logs ganham uma busca e um botão "Filtros (n)" que abre uma
   folha de baixo para cima; o primeiro registro aparece sem rolar.
7. **Ação destrutiva nunca é o primeiro nem o maior botão.** "Limpar Histórico" sai do topo do Histórico
   para Configurações → Zona de Perigo, ao lado do "Limpar Banco" — mesma rota, mesmo modal, mesma
   restrição a ADMIN (REQ-014 e constitution: nada muda no servidor). Em Chaves, "Remover" vira ação
   secundária.
8. **O desktop herda, não é redesenhado.** Tokens e componentes novos valem para todos; o layout do
   desktop (lista do Dashboard, tabelas) fica como está.

### Critério de aceite (REQ-033)

- conteúdo ≥ 14 px e rótulo ≥ 12 px, sem maiúsculas espaçadas; no máximo 5 tamanhos no celular, com
  guarda;
- num aparelho de 360×640, no Dashboard, **a busca é o primeiro controle e a primeira chave aparece sem
  rolar**; no Histórico e nos Logs, **o primeiro registro aparece sem rolar**;
- toda chave mostra a ação em palavra;
- ação destrutiva nunca é o primeiro nem o maior botão da tela;
- na primeira visita, o tema segue `prefers-color-scheme`;
- nova crítica do impeccable na mesma superfície: **≥ 32/40**, com estética e minimalismo ≥ 3.

## Alternativas consideradas

**Premium discreto** (cinzas neutros, cor quase só no status, tipo fino, muito espaço). Mais elegante,
mas exige mais leitura de quem tem pouca instrução. Rejeitada pelo usuário.

**Institucional sóbrio** (azul-marinho e verde como base forte, sem gradiente nem brilho). Resolve o
"template", mas não o público. Rejeitada pelo usuário.

**Refazer só o Dashboard sobre o DESIGN.md atual.** Mais rápido, e repete julho: a base que gera o
aspecto de template continua. Rejeitada.

## Consequências

**Positivas**
- Uma escala de tipo que o código obedece, com guarda; os 103 achados do detector deixam de existir.
- A tarefa principal do celular — achar a chave e agir — fica na primeira tela.
- A ação destrutiva sai do caminho do polegar.

**Negativas / riscos**
- **É o maior CR de interface desde a Sprint 8.** Cinco tasks, cada uma com PR e CI; o celular passa
  por uma fase em que telas refeitas convivem com telas antigas (componentes globais primeiro reduz o
  contraste).
- **Cruza com código recém-mudado** (aviso da sessão da TASK-128/131): `IndicadorDeNavegacao` nos links
  da barra inferior e da gaveta (`Sidebar.tsx`), dados iniciais pelo servidor em
  Confirmações/Logs/Usuários. As guardas `tests/troca-de-tela-suave.test.ts`,
  `tests/dados-iniciais-no-servidor.test.ts` e as E2E `transicao-suave.spec.ts` e
  `menu-no-layout.spec.ts` (0 quadros em branco) têm de continuar verdes.
- **O tema claro vira experiência comum** (antes era override): o light mode precisa estar tão acabado
  quanto o escuro — o que o REQ-029d já pedia.
- O `DashboardClient` tem 148 estilos inline; o celular refeito exige tirar estilo do componente para o
  CSS, e isso mexe no desktop por tabela (as guardas de largura da TASK-119/121 cobrem).

## Implementação

- **TASK-132 — Fundação.** `PRODUCT.md` reescrito; `DESIGN.md` novo (mundo utilitário claro); tokens de
  escala, peso, elevação e tamanho de botão no `globals.css`; guarda da escala; tema seguindo o
  aparelho na primeira visita.
- **TASK-133 — Componentes globais.** Botões (sólidos, 48/40 px, sem lift/glow), campos, cartões (sem
  sombra de repouso, sem cartão dentro de cartão), etiquetas de status (caixa normal, sem brilho), barra
  do topo (sem título duplicado, "?" no lugar certo), barra inferior; ícones SVG no lugar dos emojis.
- **TASK-134 — Dashboard no celular.** Busca primeiro e presa ao rolar; contadores viram os filtros;
  cada chave numa linha com nome, sala inteira, estado e o verbo da ação; "Minhas chaves" primeiro para
  quem porta chave (REQ-030).
- **TASK-135 — Histórico e Logs no celular.** Busca + "Filtros (n)" em folha inferior; datas com texto
  de apoio; ações num menu "⋯" com um PDF só; "Limpar Histórico" para a Zona de Perigo; métricas em
  linguagem simples ou fora do celular.
- **TASK-136 — Chaves e Usuários em lista no celular.** Linha com nome, sala/papel e estado; editar e
  remover como ações secundárias, remover com confirmação.

Cada task pelo ciclo TDD, verificada no navegador a 360 e 375 px nos dois temas; ao fim da 136, nova
crítica do impeccable.
