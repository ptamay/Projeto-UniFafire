# CLAUDE.md — Contexto do Projeto para Claude Code
> Lido automaticamente pelo Claude Code ao iniciar em qualquer diretório do projeto.
> Versão compatível com Constitutional SDD v5 (migrado do v4.4.0 em 2026-07-06)
> Mapa do projeto: `AGENTS.md` · Memória permanente: `.sdd/memory/`
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
- Fase: 8-10 (execução de sprint) — ADR-012 APROVADO; Sprint 21 concluída
- Sprint/Task Ativa: Nenhuma. Sprints 16–21 concluídas.
- Última Ação: Sprint 21 (Etapa 4 do ADR-012 — camada de dados assíncrona) fechada.
  TASK-068 a 071: src/lib/pg.ts (query/queryOne/execute/withTransaction/closePool, pool
  PREGUIÇOSO, sem prepared statement nomeado), 162 chamadas síncronas em 28 arquivos
  convertidas em 5 fatias por FRONTEIRA DE EXECUÇÃO, transações explícitas com client
  dedicado, bypass da imutabilidade por set_config transacional, bcrypt→bcryptjs e
  postinstall removido. src/lib/db.ts APAGADO — nada em src/ importa better-sqlite3, que
  virou devDependency. Fora do escopo original: backup.ts e as rotas restore/import
  NEUTRALIZADOS (503 citando a TASK-078). Verificado: 284 testes / 37 arquivos, 6 gates,
  tsc 0, eslint 0, npm run build OK, npm audit 0 vulnerabilidades, e o app rodado de ponta
  a ponta no navegador contra o Postgres do container.
- Próxima Ação: Sprint 22 — Etapa 5 (Realtime · REQ-032): TASK-072 e 073. Substituir os 4
  pollings de 3 s por assinatura Realtime; critério de aceite ≤ 500 ms entre dispositivos,
  com degradação graciosa para polling largo sem WebSocket.
- Decisões em aberto: expurgar keys.db do histórico antigo do git exige reescrever
  história — baixo risco (não contém secret; a decisão do banco dos testes foi resolvida
  como D-11: Postgres em container).
- Testes: exigem Postgres em container — `npm run test:db:up` ANTES de `npx vitest`.
  Atenção: a suíte dá TRUNCATE no mesmo banco usado para verificação no navegador.
- Estado do Supabase: schema das 9 tabelas + índices + triggers de imutabilidade + RLS
  aplicados; dados SINTÉTICOS carregados (20 users, 5 keys, 92 tx, 30 history, 99 logs, 4
  settings). PII real só entra na Etapa 7, com ciência formal da direção (constitution §0).
- Arquivos não commitados: CLAUDE.md (este checkpoint) + memory sync
- Branch atual: feature/sprint-21-camada-async (Sprints 16–21)
- Pendências do usuário: NENHUMA. PR #14 (release v0.3.0) merged em 03e4466 (2026-09-04).
- ⚠️ NÃO EXISTE PRODUÇÃO (confirmado pelo usuário em 2026-09-04). Não há servidor PM2 em
  uso, não há keys.db com dados reais, ninguém usa o sistema hoje. Os dados reais ainda
  serão cadastrados/importados de outra fonte, direto no Postgres. O destino é Vercel +
  Supabase. Consequências, TODAS já verificadas no código — não repita as premissas antigas:
  · A pendência "node db/migrate.mjs up no keys.db de produção", carregada por várias
    sprints, era FANTASMA. Não há banco para migrar. db/migrations/ (SQLite) fica só como
    histórico; Gate 2 e tests/migrations.test.ts continuam cobrindo o pareamento.
  · O plano de reversão do ADR-012 (§Reversão, itens 2/3/4) pressupõe PM2 + keys.db de
    produção e portanto está VAZIO. Não é problema — sem estado anterior não há ponto de
    não-retorno —, mas o ADR declara uma rede que não existe. Correção pendente = CR Tipo C.
  · O conteúdo do keys.db anterior era FICTÍCIO (esclarecido pelo usuário). Não há dado a
    preservar, migração de dados nem risco de PII no que existe hoje. Objetivo declarado:
    "fazer o sistema funcionar no Supabase e Vercel. Só isso."
  · A TASK-067 (db/load-pg.mjs) fica sem uso no caminho de produção — correta e testada,
    ferramenta pronta caso um dia exista um SQLite de origem. Fora do go-live.
  · Gap do bootstrap do ADMIN: virou TASK-080, aberta no plan.md (Sprint 24), e PRECEDE a
    TASK-079 — sem ela o sistema sobe inacessível.
- Bloqueantes para o go-live: (1) TASK-080 — bootstrap do primeiro ADMIN; (2) TASK-078 —
  desde a Sprint 21 NÃO HÁ backup de aplicação, só o gerenciado do provedor, que a
  constitution §4.3 exige verificar (peso reduzido: não há dado real a perder hoje).
- Sequenciamento a rever: o objetivo do usuário é subir no Supabase+Vercel, e a Sprint 22
  (Realtime) é feature, não pré-requisito. Vale considerar antecipar a Etapa 7 (TASK-080,
  076, 077, 079) antes das Sprints 22–23. NÃO decidido — perguntar ao usuário.
- Atualizado em: 2026-09-04
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

1. `.sdd/memory/constitution.md` — lei máxima (se ausente: pare e avise)
2. `.sdd/memory/plan.md` — stack aprovada, decisões, AI Cost Budget
3. `.sdd/memory/spec.md` — escopo e métricas (leia só se a tarefa envolve requisitos)
4. `.sdd/memory/overview.md` — contexto humano (leia só se não tiver clareza do domínio)

> Nunca releia todos os 4 por reflexo. Se `constitution.md` + `plan.md` são suficientes
> para a tarefa, pare aí. `spec.md` e `overview.md` são sob demanda.

---

## Seu papel neste projeto

Você é o **agente de arquitetura e desbloqueio**, não o agente de execução de sprint.

| Faça | Não faça |
|------|----------|
| Auditar consistência de artefatos | Executar tasks do `tasks.md` autonomamente |
| Gerar e revisar ADRs | Executar sprint sem direcionamento do usuário (sprints 🔴 críticas rodam aqui via skill `sprint`) |
| Depurar decisões complexas | Criar código sem verificar `constitution.md` |
| Revisar Fitness Functions (`.semgrep/`) | Assumir stack não listada no `plan.md` |
| Apoiar a Fase 6 (síntese SDD Triad) | Avançar fases sem aprovação explícita do usuário |

---

## Estado atual do projeto

> ⚠️ Esta seção é atualizada pelo Antigravity ao fim de cada sprint via Memory Sync (Step 10).
> Se estiver desatualizada, leia `.sdd/memory/constitution.md` como fonte de verdade.

```
Modo do projeto   : EXPRESSO
Sprint atual      : — (nenhuma ativa; Sprint 21 concluída)
Última sprint     : 21 ✅ (Etapa 4 do ADR-012 — Camada de Dados Assíncrona · TASK-068 a 071)
Fase atual        : 8-10 (execução da migração ADR-012; Etapas 3–7 = Sprints 20–24, Etapas 3 e 4 fechadas)
Último commit     : (ver git log -1)
Próxima ação      : Sprint 22 — Etapa 5 (Realtime · REQ-032 · TASK-072 e 073)
```

---

## Stack aprovada (referência rápida)

> Fonte canônica: `.sdd/memory/plan.md` — seção "Stack e Decisões".
> Não use ferramentas fora desta lista sem registro explícito em `plan.md`.

| Camada | Ferramenta padrão |
|--------|------------------|
| Frontend | Next.js + Tailwind CSS + Custom CSS |
| Backend / dados | **Postgres (Supabase, `sa-east-1`) via `pg`** — `src/lib/pg.ts`. Sem ORM, sem prepared statement nomeado, `$n` sempre |
| Auth | Sessão/JWT (`jose`) em cookie + `bcryptjs` |
| Deploy | **Vercel** (⏳ Etapa 7 — PM2 local ainda vigente até lá) |
| Testes | Vitest contra **Postgres real em container** (`npm run test:db:up`) + Playwright |
| Secrets | .env local |
| Erros | Sentry |
| Agente de sprint | Antigravity |

> ⚠️ `better-sqlite3` saiu do runtime na Sprint 21 e é **devDependency** — usado só pelas
> ferramentas offline `db/migrate.mjs` e `db/load-pg.mjs`. Importá-lo em `src/` reprova a suíte.

---

## Quando o usuário te aciona — contextos comuns

### Fase 6 — Geração da SDD Triad (você é protagonista aqui)

> ⚠️ Nesta fase, `constitution.md`, `spec.md` e `plan.md` **ainda não existem** —
> sua função é GERÁ-LOS, não auditá-los.

Use a skill `arquitetura`. Leia `.sdd/memory/handoff.md` (gerado ao fim da Fase 5) e
`.sdd/memory/overview.md`. Carregue `.sdd/reference/modules/security-constitution.md` +
`.sdd/reference/modules/architecture-governance.md` (no v5 eles vivem neste repositório,
em `.sdd/reference/`) antes de gerar qualquer artefato.

Gere `constitution.md`, `spec.md`, `plan.md` (e `api-contract.md` + `adr/*.md` se
aplicável) conforme o template da Fase 6 em `.sdd/reference/master-spec-core.md`.

Ao final, execute o checklist do CHECKPOINT da Fase 6 (mesmo arquivo) antes de
informar ao usuário que pode prosseguir para a Fase 7.

**Calibração de esforço nesta fase:** ver seção "Effort Levels — Fase 6" em
`.sdd/reference/master-spec-core.md`. Gates e checklists usam esforço mínimo; síntese de
`constitution.md`, `plan.md` e auditoria cruzada usam esforço máximo.

### Desbloqueio de sprint (Antigravity travou)
Leia `.agents/workflows/sprint.md` + `tasks.md` da sprint atual.
Entenda o que o agente fez, o que falhou e por quê.
Proponha a correção. Não reescreva o que já foi feito sem necessidade.

### Change Request — nova ideia ou mudança de escopo
Ouça a descrição do usuário. Classifique como Tipo A, B, C ou D conforme
a regra `.agents/rules/40-change-request.md` (autocontida). Apresente a classificação e o impacto
antes de alterar qualquer artefato. Aguarde confirmação para Tipo C e D.
Nunca implemente a mudança diretamente — atualize `spec.md`, `plan.md` e/ou
`adr/*.md` e faça o commit do Change Request. A implementação entra pelo
ciclo TDD normal na próxima sprint.

### Geração de ADR
Use o template de `/docs/adr/ADR-NNN-*.md`.
Baseie-se em decisões já tomadas e registradas em `plan.md`.
Nunca invente decisão — apenas formalize o que já foi decidido.

### Review pós-sprint
Leia o Report do Step 9 em `.agents/workflows/sprint.md`.
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
.sdd/
  memory/
    constitution.md     ← lei máxima
    spec.md             ← o quê e por quê
    plan.md             ← como e roadmap
    overview.md         ← contexto humano
    handoff.md          ← resumo Fases 1–5 (para Fase 6)
    ui-context.md       ← identidade visual (para agentes de UI)
    threat_model_stride.md
  reference/            ← processo completo do framework (ler POR SEÇÃO, nunca inteiro)
  mcp_config.json       ← governança MCP
  agent_config.py       ← sandbox deny-by-default

.agents/
  rules/                ← regras (00-core … 40-change-request) — zona somente leitura
  workflows/            ← /escopo /sprint /quick-fix /change-request /status … (Antigravity)

.claude/skills/         ← skills do Claude Code (arquitetura, sprint, carga-dados…)

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
