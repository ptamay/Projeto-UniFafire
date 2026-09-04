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
- Fase: 8-10 (execução de sprint) — ADR-012 APROVADO e REORDENADO; Sprint 22 concluída
- Sprint/Task Ativa: Nenhuma. Sprints 16–22 concluídas.
- Última Ação: Sprint 22 (Etapa 7a do ADR-012 — pré-requisitos do go-live) fechada.
  TASK-080 bootstrap do primeiro ADMIN (script em db/, exclusividade por NOT EXISTS no SQL,
  senha aleatória impressa uma vez; scripts/init-db.js e o admin/admin REMOVIDOS);
  TASK-074 structured-logger → app_logs (migration pareada, trigger de imutabilidade, fora
  de tablesToClear) — subiu da Etapa 6 por ser pré-requisito, não melhoria;
  TASK-076 política de segredo (recusa UUID, repetição e o placeholder do .env.example) e
  cookie `secure` incondicional em produção, com app-env.ts extraído por causa do Edge;
  TASK-077 proxy passa a NEGAR por padrão — rota nova nasce fechada, API 401 e página 307;
  TASK-081 (CR Tipo B no meio da sprint) as 27 chamadas de logAction sem await, mais
  @typescript-eslint/no-floating-promises como guarda mecânica na superfície de servidor.
  Verificado: 352 testes / 41 arquivos, 6 gates, tsc 0, eslint 0, npm audit 0
  vulnerabilidades, npm run build OK, e o sistema exercitado no navegador de uma base
  VAZIA até o painel — bootstrap, troca forçada de senha, todas as páginas e a trilha de
  auditoria aparecendo na tela de Logs.
- Próxima Ação: Sprint 23 — Etapa 7b: Backup e Deploy. TASK-078 (backup gerenciado +
  verificação agendada — bloqueante do go-live pela §4.3), TASK-075 (métrica de backup sai
  do .jsonl e vem do banco) e TASK-079 (deploy no Vercel, ping agendado, e remoção do
  aparato local: PM2, .bat, ecosystem.config.js, show-ip.js e /api/server-info).
- ⚠️ NÃO EXISTE PRODUÇÃO (confirmado em 2026-09-04). Sem servidor PM2, sem keys.db real, e o
  conteúdo do banco anterior era FICTÍCIO. Não há migração de dados no caminho do go-live.
  Objetivo declarado pelo usuário: "fazer o sistema funcionar no Supabase e Vercel. Só isso."
  O plano de reversão do ADR-012 foi corrigido (protegia estado inexistente) e a TASK-067
  (db/load-pg.mjs) ficou sem uso no caminho de produção — correta e testada, mas fora do go-live.
- Decisões em aberto: expurgar keys.db do histórico antigo do git (risco baixíssimo —
  aqueles arquivos nunca tiveram dado real).
- ⚠️ TESTES: exigem Postgres em container — `npm run test:db:up` ANTES de `npx vitest`.
  A suíte dá TRUNCATE no MESMO banco usado para verificar no navegador. Isto reincidiu 3x
  na Sprint 22 e sempre parece defeito de autenticação: o login recusa credencial que
  estava correta. REGRA: verificação no navegador é sempre o ÚLTIMO passo, depois da suíte
  e dos gates. Para semear: TRUNCATE + `node db/bootstrap-admin.mjs`.
- Estado do Supabase: schema + índices + triggers + RLS aplicados; dados SINTÉTICOS da
  TASK-067 ainda lá. Limpar `users` é pré-requisito de rodar a TASK-080 contra ele — o
  bootstrap recusa base povoada, por construção.
- Arquivos não commitados: nenhum
- Branch atual: feature/sprint-22-pre-requisitos-go-live (Sprints 16–22, não publicada)
- Pendências do usuário: nenhuma. PR #14 (release v0.3.0) merged em 03e4466.
- Bloqueante para o go-live: TASK-078 — desde a Sprint 21 NÃO HÁ backup de aplicação, só o
  gerenciado do provedor, que a §4.3 exige VERIFICAR e não apenas ter. Peso reduzido pelo
  fato de não haver dado real a perder hoje, mas continua bloqueante.
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
Sprint atual      : — (nenhuma ativa; Sprint 22 concluída)
Última sprint     : 22 ✅ (Etapa 7a do ADR-012 — Pré-requisitos do Go-Live · TASK-080, 074, 076, 077, 081)
Fase atual        : 8-10 (migração ADR-012 REORDENADA em 2026-09-04 — Sprint 22 = Etapa 7a,
                    Sprint 23 = Etapa 7b, Sprint 24 = Etapa 5; Etapa 6 dissolvida.
                    Etapas 3, 4 e 7a fechadas — falta 7b e depois a 5)
Último commit     : (ver git log -1)
Próxima ação      : Sprint 23 — Etapa 7b: Backup e Deploy (TASK-078, 075, 079)
```

---

## Stack aprovada (referência rápida)

> Fonte canônica: `.sdd/memory/plan.md` — seção "Stack e Decisões".
> Não use ferramentas fora desta lista sem registro explícito em `plan.md`.

| Camada | Ferramenta padrão |
|--------|------------------|
| Frontend | Next.js + Tailwind CSS + Custom CSS |
| Backend / dados | **Postgres (Supabase, `sa-east-1`) via `pg`** — `src/lib/pg.ts`. Sem ORM, sem prepared statement nomeado, `$n` sempre |
| Auth | Sessão/JWT (`jose`) + `bcryptjs`. Segredo validado por `src/lib/secret-policy.ts` — o processo NÃO SOBE com segredo fraco. Cookie só por `src/lib/session-cookie.ts`, com `secure` incondicional em produção |
| Deploy | **Vercel** (⏳ Sprint 23). Não existe PM2 em produção — o aparato local sai na TASK-079 sem janela de retenção |
| Testes | Vitest contra **Postgres real em container** (`npm run test:db:up`) + Playwright |
| Secrets | .env local |
| Erros | Sentry |
| Autorização | `src/proxy.ts` NEGA por padrão (API 401, página 307). Papel continua sendo do handler — §3.2 |
| Agente de sprint | Antigravity |

> ⚠️ `better-sqlite3` saiu do runtime na Sprint 21 e é **devDependency** — usado só pelas
> ferramentas offline `db/migrate.mjs` e `db/load-pg.mjs`. Importá-lo em `src/` reprova a suíte.
>
> ⚠️ Promessa solta é **erro de lint** na superfície de servidor desde a TASK-081
> (`@typescript-eslint/no-floating-promises`). Chamada assíncrona sem `await` em rota, lib,
> proxy ou Server Component reprova o pre-commit — em serverless a instância congela quando
> a resposta sai e a escrita pendente morre com ela.

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
