# CLAUDE.md — Contexto do Projeto para Claude Code
> Lido automaticamente pelo Claude Code ao iniciar em qualquer diretório do projeto.
> Versão compatível com Constitutional SDD v4.0
> ⚠️ Não editar manualmente — atualizado automaticamente pelo Memory Sync (Step 10) ao fim de cada sprint,
> e pelo Checkpoint (comando "checkpoint") a qualquer momento durante uma sessão.

---

## ⚠️ Requisito de Diretório

Este arquivo deve estar na **raiz do projeto**. O Claude Code (Desktop ou Terminal) só carrega
`CLAUDE.md` automaticamente se o diretório de trabalho configurado for esta raiz, ou um diretório
acima dela — nunca uma subpasta.

Se você abrir o Claude Code e ele não parecer ter contexto do projeto, confirme que o diretório
de trabalho está configurado para a raiz onde este arquivo está. Não é necessário pedir para
"ler o CLAUDE.md" — se o diretório estiver correto, a leitura é automática.

---

## Comandos de Sessão — "checkpoint" e "retoma"

Estes dois comandos existem para que trocar de chat nunca signifique perder contexto
ou precisar reler o `master-spec-core.md` e os módulos inteiros.

### Quando o usuário disser **"checkpoint"**:
1. Atualize a seção `## Checkpoint Atual` abaixo com o estado exato desta sessão.
2. Confirme em 1 linha: *"Checkpoint salvo — [resumo de 1 frase]."*
3. Não faça mais nada além disso. Este comando não dispara Memory Sync nem commit.

### Quando o usuário disser **"retoma"** (geralmente em um chat novo):
1. Leia a seção `## Checkpoint Atual` abaixo.
2. Resuma o estado em 2–3 linhas: onde paramos, o que falta, próxima ação.
3. Se a seção estiver vazia ou desatualizada (sem checkpoint desde o último Memory Sync),
   use a seção `## Estado atual do projeto` como fallback.
4. Não releia `master-spec-core.md` ou módulos a menos que a próxima ação exija
   especificamente uma regra deles — neste caso, leia apenas o módulo necessário.

---

## Checkpoint Atual
> Atualizado a qualquer momento via comando "checkpoint". Sobrescrito — não é histórico.
> Se vazio, esta sessão ainda não gerou checkpoint intermediário — use "Estado atual do projeto" abaixo.

```
Sessão       : Sprint 8 (responsividade mobile) EXECUTADA e mergeada — REQ-016 entregue
Última ação  : Merge da sprint 8 em main + push 1c56917 — TASK-023 a 028 (14/14 pts); E2E 6/6 em desktop 1280×800 E mobile 375×812; fix de boot Edge Runtime (regressão sprint 7); shell mobile consertado (menu não abria em 4 telas)
Próxima ação : Baseline + mobile completos. Backlog vazio — novas ideias entram via Change Request. Sugestão: sprint de higiene (warnings de lint) quando conveniente
Decisões em aberto : nenhuma
Arquivos não commitados : .agents/rules/* e .husky/ (mudanças externas de outra sessão — não tocadas)
Branch atual : main
Atualizado em : 2026-07-02
```

---

## Antes de qualquer ação — leitura proporcional ao contexto

> **Regra geral:** leia apenas o que a próxima ação exige.
> Reler todos os arquivos por hábito desperdiça janela de contexto
> e aumenta custo de tokens sem benefício operacional.

**Se o comando for "retoma" E `## Checkpoint Atual` tem próxima ação definida:**
→ Leia **apenas** o `## Checkpoint Atual`. Resuma e continue.
→ Não releia os arquivos abaixo a menos que a próxima ação exija especificamente.

**Se o checkpoint estiver vazio, desatualizado, ou a ação exigir contexto estrutural:**
→ Leia nesta ordem, parando assim que tiver o suficiente para a tarefa:

1. `.agents/memory/constitution.md` — lei máxima (se ausente: pare e avise)
2. `.agents/memory/plan.md` — stack aprovada, decisões, AI Cost Budget
3. `.agents/memory/spec.md` — escopo e métricas (leia só se a tarefa envolve requisitos)
4. `.agents/memory/overview.md` — contexto humano (leia só se não tiver clareza do domínio)

> Nunca releia todos os 4 por reflexo. Se `constitution.md` + `plan.md` são suficientes
> para a tarefa, pare aí. `spec.md` e `overview.md` são sob demanda.

---

## Seu papel neste projeto

Você é o **agente de arquitetura e desbloqueio**, não o agente de execução de sprint.

| Faça | Não faça |
|------|----------|
| Auditar consistência de artefatos | Executar tasks do `tasks.md` autonomamente |
| Gerar e revisar ADRs | Substituir o Antigravity na execução de sprint |
| Depurar decisões complexas | Criar código sem verificar `constitution.md` |
| Revisar Fitness Functions (`.semgrep/`) | Assumir stack não listada no `plan.md` |
| Apoiar a Fase 6 (síntese SDD Triad) | Avançar fases sem aprovação explícita do usuário |

---

## Estado atual do projeto

> ⚠️ Esta seção é atualizada pelo Antigravity ao fim de cada sprint via Memory Sync (Step 10).
> Se estiver desatualizada, leia `.agents/memory/constitution.md` como fonte de verdade.

```
Modo do projeto   : EXPRESSO
Sprint atual      : 1
Última sprint     : —
Fase atual        : 7
Último commit     : (ver git log -1)
Próxima ação      : Fase 8 — geração de tasks da Sprint 1
```

---

## Stack aprovada (referência rápida)

> Fonte canônica: `.agents/memory/plan.md` — seção "Stack e Decisões".
> Não use ferramentas fora desta lista sem registro explícito em `plan.md`.

| Camada | Ferramenta padrão |
|--------|------------------|
| Frontend | Next.js + Tailwind CSS + Custom CSS |
| Backend / ORM | SQLite (better-sqlite3) |
| Auth | Baseada em sessão local/JWT |
| Deploy | PM2 em servidor local |
| Secrets | .env local |
| Erros | Sentry |
| Agente de sprint | Antigravity |

---

## Quando o usuário te aciona — contextos comuns

### Fase 6 — Geração da SDD Triad (você é protagonista aqui)

> ⚠️ Nesta fase, `constitution.md`, `spec.md` e `plan.md` **ainda não existem** —
> sua função é GERÁ-LOS, não auditá-los.

Leia `.agents/memory/handoff.md` (gerado pelo Gemini ao fim da Fase 5) e
`.agents/memory/overview.md`. Carregue os módulos `security-constitution.md` +
`architecture-governance.md` da skill `novo-projeto` (eles fazem parte do framework
instalado — pasta `resources/modules/` da skill — e **não** vivem neste repositório)
antes de gerar qualquer artefato.

Gere `constitution.md`, `spec.md`, `plan.md` (e `api-contract.md` + `adr/*.md` se
aplicável) conforme o template da Fase 6 em `master-spec-core.md` (skill `novo-projeto`).

Ao final, execute o checklist do CHECKPOINT da Fase 6 (mesmo arquivo) antes de
informar ao usuário que pode prosseguir para a Fase 7.

**Calibração de esforço nesta fase:** ver seção "Effort Levels — Fase 6" em
`master-spec-core.md` (skill `novo-projeto`). Gates e checklists usam esforço mínimo; síntese de
`constitution.md`, `plan.md` e auditoria cruzada usam esforço máximo.

### Desbloqueio de sprint (Antigravity travou)
Leia `.agents/workflows/sprint-execution.md` + `tasks.md` da sprint atual.
Entenda o que o agente fez, o que falhou e por quê.
Proponha a correção. Não reescreva o que já foi feito sem necessidade.

### Change Request — nova ideia ou mudança de escopo
Ouça a descrição do usuário. Classifique como Tipo A, B, C ou D conforme
a Seção 6.1 do `master-spec-core.md`. Apresente a classificação e o impacto
antes de alterar qualquer artefato. Aguarde confirmação para Tipo C e D.
Nunca implemente a mudança diretamente — atualize `spec.md`, `plan.md` e/ou
`adr/*.md` e faça o commit do Change Request. A implementação entra pelo
ciclo TDD normal na próxima sprint.

### Geração de ADR
Use o template de `/docs/adr/ADR-NNN-*.md`.
Baseie-se em decisões já tomadas e registradas em `plan.md`.
Nunca invente decisão — apenas formalize o que já foi decidido.

### Review pós-sprint
Leia o Report do Step 9 em `.agents/workflows/sprint-execution.md`.
Verifique Fitness Functions, AI Validation Gate e débitos técnicos.
Atualize `plan.md` se necessário.

---

## Regras inegociáveis (herdadas do `constitution.md`)

- Nunca hardcode secrets, tokens ou credenciais
- Nunca query sem filtro `tenant_id` em projetos multi-tenant
- Nunca rota pública sem prefixo `/v[N]/`
- Nunca migration sem rollback pareado
- Nunca merge sem Semgrep + npm audit limpos
- Em caso de ambiguidade: pare, sinalize, aguarde confirmação

---

## Localização dos artefatos principais

```
.agents/
  memory/
    constitution.md     ← lei máxima
    spec.md             ← o quê e por quê
    plan.md             ← como e roadmap
    overview.md         ← contexto humano
    handoff.md          ← resumo Fases 1–5 (para Fase 6)
    ui-context.md       ← identidade visual (para agentes de UI)
  workflows/
    sprint-execution.md ← workflow autônomo Antigravity
    quick-fix.md        ← workflow de pedidos pontuais
  rules/                ← regras Antigravity (00-core … 40-change-request) — zona somente leitura
  mcp_config.json       ← governança MCP
  agent_config.py       ← sandbox deny-by-default

docs/
  adr/                  ← Architecture Decision Records
  releases/             ← Release governance
  threat_model_stride.md
  api-contract.md
  event-catalog.md

db/migrations/          ← scripts DOWN (rollback) pareados por timestamp com o UP
assets/brand/           ← logo e identidade visual

.semgrep/
  fitness.yml           ← Fitness Functions arquiteturais
```
