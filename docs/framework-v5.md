# Constitutional SDD v5

Framework de desenvolvimento com IA para software **seguro, rápido e sem perda de contexto**.
Um processo (Fases 0–11), três executores (Antigravity/Gemini, Claude Code, scripts mecânicos),
uma única fonte de verdade por assunto.

## Por que o v5 existe (o que estava quebrado no v4)

1. **Não dava para saber se o framework estava ativo.** O v4 misturava tudo em `.agents/`
   (rules, skills, memória e 270KB de referência) e a ativação dependia de configuração
   manual no painel + Model Decision do modelo. No v5, `.agents/` contém SÓ o que o
   Antigravity lê e carrega sozinho (rules + workflows); dados do framework foram para
   `.sdd/`. Atenção de versão: o Antigravity 2.x lê `.agents/` (plural); versões 1.x
   liam `.agent/` (singular) — na 1ª sessão de cada projeto, confira em
   Customizations → Rules que os 5 arquivos aparecem.
2. **Comandos não existiam de verdade.** "checkpoint", "retoma", "/ai-pentest" eram texto
   dentro de regra — o agente podia ignorar. No v5 são **workflows** (`/escopo`, `/sprint`,
   `/quick-fix`, `/change-request`, `/checkpoint`, `/retoma`, `/carga-dados`, `/pentest`) —
   comandos reais com passos numerados.
3. **Enforcement dependia de obediência do modelo.** O READ GATE de 30 linhas por resposta
   queimava tokens e ainda podia ser teatralizado. No v5 a prova de leitura é **1 linha** (🔒)
   e a garantia dura é **mecânica**: `ci-gates.sh` + git hooks são arquivos reais em
   `scripts/`, não blocos de código dentro de markdown que ninguém extraía.
4. **Contexto caro.** A skill `novo-projeto` mandava ler 57KB de uma vez. No v5 toda skill e
   workflow lê **só a seção da fase atual** (via Grep pelo header) — o conteúdo pesado virou
   biblioteca de referência em `.sdd/reference/`.

## Estrutura

```
AGENTS.md            ← contexto do projeto (padrão aberto — Antigravity, Gemini, etc.)
CLAUDE.md            ← contexto p/ Claude Code + Checkpoint Atual (retomada de sessão)
GEMINI.md            ← ponteiro p/ AGENTS.md (Gemini CLI)
.agents/
  rules/             ← comportamento SEMPRE ativo/condicional no Antigravity (auto-carrega)
    00-core.md         (always_on — 3KB: rotas, memória, segurança, linha 🔒)
    10-sprint-tdd.md   (model_decision) · 20-migrations (glob) · 30-quick-fix · 40-change-request
  workflows/         ← comandos / do Antigravity (9 workflows, incl. /status)
.claude/
  skills/            ← Claude Code auto-descobre (8 skills)
    criar-projeto (bootstrap verificado) · adotar-projeto (vibe coding → framework, e re-sync)
    novo-projeto (Fases 0–5) · arquitetura (Fase 6) · sprint (Fases 8–11)
    proposta (pré-projeto) · carga-dados (Fase 10.5) · ai-pentest
.sdd/
  memory/            ← Memory Bank do projeto (overview, constitution, spec, plan, tasks)
  reference/         ← processo completo v4 preservado — leitura SOB DEMANDA por seção
scripts/
  ci-gates.sh        ← 6 gates mecânicos, STACK-AGNÓSTICOS (detectam Node/Python e pulam
                       com aviso o que não se aplica — a stack é decidida na Fase 6)
  check-imports.js / check-imports.py · hooks/ (pre-push, commit-msg, post-commit) · install-hooks.ps1
novo-projeto.ps1     ← bootstrap: copia este template p/ E:\@Projetos\<Nome> (nunca move)
```

## Enforcement em 3 camadas (do mais barato ao mais caro)

| Camada | O quê | Custo de tokens |
|--------|-------|-----------------|
| 1. Mecânica | git hooks + `ci-gates.sh` + CI — TDD, migrations, secrets, imports | zero |
| 2. Estrutural | rules auto-carregadas + workflows + skills — o agente entra pela rota certa | mínimo |
| 3. Cognitiva | linha 🔒 (prova de leitura) + aprovação por fase + Sprint Binding | 1 linha/resposta |

O que é inegociável NUNCA depende só da camada 3.

## Estratégia de tokens (Claude limitado + Gemini no Antigravity)

- **Antigravity/Gemini (volume):** Fases 0–5, sprints 🟢/🟡 (CRUD, UI, boilerplate).
- **Claude Code (precisão):** Fase 6 (Opus), sprints 🔴 (auth, RLS, financeiro, dado sensível),
  CR Tipo C/D, reviews. Modelos: Opus = sintetizar/decidir/auditar · Sonnet = implementar ·
  Haiku = mecânico.
- **Troca de canal sem perder contexto:** `/checkpoint` antes de sair → `/retoma` no outro
  agente. O Memory Bank (`.sdd/memory/`) é o mesmo para todos.

## Como usar

**Projeto novo:** no Claude Code, diga "criar projeto MeuSistema" (skill `criar-projeto` —
dirige o `novo-projeto.ps1` e VERIFICA o resultado com checklist) → Antigravity na raiz →
`/status` (confirma ativação) → `/escopo` (Fases 0–5) → Claude Code: "fase 6" → `/sprint`
(Antigravity) ou skill `sprint` (Claude) → repetir por sprint → `/carga-dados` e `/pentest`
quando aplicável. Sem Claude disponível: `.\novo-projeto.ps1 -Nome "MeuSistema"` direto.

**Projeto existente (vibe coding / legado):** skill `adotar-projeto` no Claude Code, na raiz
do projeto — inventário, estrutura, memória por engenharia reversa (aprovação obrigatória),
baseline de gates com débitos na Sprint 0. Também re-sincroniza projetos v5 com o template.

**Proposta comercial (antes do projeto existir):** skill `proposta` no Claude Code.

**Promover o v5 a template oficial** (quando validado num projeto piloto):
1. Mova esta pasta `v5\` para fora do template v4 (ex.: `E:\@Projetos\@ESCOPO DE PROJETOS\template-v5\`).
2. Renomeie o template antigo `.agents` → `.agents-v4-backup` (o v4 fica intacto).
3. Aponte seu atalho de bootstrap para o `novo-projeto.ps1` DESTA pasta (ele copia o
   template para a RAIZ do projeto, não para um subdiretório `.agents`).

**Migrar um projeto v4 em andamento:**
1. No projeto, mova `.agents\memory\*` para `.sdd\memory\` (é a única coisa do `.agents`
   antigo que tem valor — o resto é cópia do template) e delete o `.agents\` antigo.
2. Copie do template v5 para a raiz do projeto: `.agents\` (novo — só rules+workflows),
   `.claude\`, `.sdd\reference\`, `scripts\`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`.
3. Rode `scripts\install-hooks.ps1` e preencha os placeholders de `AGENTS.md`/`CLAUDE.md`
   com o que já existe no memory.

## Caminho futuro (não bloqueia o uso hoje)

- **Plugin do Claude Code:** quando o v5 estabilizar, as 6 skills + hooks podem virar um
  plugin instalável (versionado, sem cópia por projeto). O lado Antigravity continua por
  template — plugins são só do Claude Code.
- **Gemini CLI:** o `GEMINI.md` já cobre; para rules nativas, espelhar `00-core.md` se necessário.

## Regras de manutenção do template

- Agentes de execução NUNCA editam `.agents/rules/`, `.agents/workflows/`, `scripts/` (zona
  somente leitura). Mudança no framework = Change Request Tipo D, feita por você aqui no
  template mestre — os projetos recebem a atualização na próxima cópia.
- `.sdd/reference/` é a memória institucional (conteúdo v4 com caminhos atualizados).
  Regras operacionais novas nascem nos arquivos finos (rules/workflows/skills) — a
  referência é consultada, não carregada inteira.
