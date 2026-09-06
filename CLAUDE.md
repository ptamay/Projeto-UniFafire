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
1. Atualize a seção `## Checkpoint Atual
> Atualizado a qualquer momento via comando "checkpoint". Sobrescrito — não é histórico.
> Se vazio, esta sessão ainda não gerou checkpoint intermediário — use "Estado atual do projeto" abaixo.

```
- Fase: 11 — GO-LIVE CONCLUÍDO em 2026-09-06. O sistema está NO AR.
- Sprint/Task Ativa: Nenhuma. Sprints 16–23 concluídas e publicadas na `main`.
- PRODUÇÃO (a partir de 2026-09-06 — a nota "NÃO EXISTE PRODUÇÃO" está VENCIDA):
  · App: https://projeto-uni-fafire.vercel.app — Vercel, escopo `projeto-uni-fafire`,
    conta `unifafiregc@gmail.com` (DIFERENTE da conta ligada ao GitHub `ptamay`; o
    `vercel` CLI logado como ptamay NÃO enxerga o projeto — ver runbook §0)
  · Banco: Supabase `sa-east-1`, 11 tabelas, todas as migrations aplicadas
  · Backup: `ptamay/unifafire-backups` (privado), primeiro dump verificado em
    2026-09-06 — 67 linhas / 11 tabelas / 23 índices / 6 triggers / 11 sob RLS
  · ADMIN: usuário `admin`, senha já trocada pelo usuário na tela
- Última Ação: **Sprint 25 EXECUTADA e FECHADA — Etapa 5 do ADR-012 (Realtime).**
  O caminho literal do ADR (`postgres_changes`) foi REJEITADO com base em
  verificação: ele autoriza por RLS, e este sistema tem RLS negando tudo a `anon`
  e não usa Supabase Auth — usá-lo exigiria abrir as tabelas de chaves à chave
  anônima do bundle (§3.2). O Realtime passou a carregar **sinal vazio** por
  trigger (`realtime.send`), e o cliente refaz a busca pelas rotas autenticadas.
  TASK-073 dá a rede de segurança: sem sinal, polling de 30 s em vez de tela
  congelada. Medido no cenário degradado: 12 requisições de API em 89 s, contra
  ~145 do polling de 3 s. PR #23 merged.
- ⚠️ **O REQ-032 NÃO ESTÁ DEMONSTRADO.** A defasagem de ≤ 500 ms exige Realtime de
  verdade. Enquanto não houver um número medido no `plan.md`, o requisito que
  motivou a migração inteira está entregue em CÓDIGO e não em FATO. Ver Próxima Ação.
- Ação anterior: **Sprint 24** (faxina da tela · ADR-013) (faxina da tela · ADR-013) —
  PR #21 aberto, aguardando merge.
  TASK-084 saíram `startCronJobs()`, `src/instrumentation.ts` e a dependência
  `node-cron`: 52 das 60 linhas de `app_logs` em produção eram `cron_desativado`,
  87% da trilha, e a §7.1 proíbe limpá-la;
  TASK-082 a tela perdeu os quatro controles inertes, o card de importar `.db`, as
  rotas `restore`/`import`, o `POST /api/backups` e o `createBackup()` — e ganhou
  o arranjo real do backup em texto;
  TASK-083 a leitura de `auto_logout_time` passa a recusar valor herdado inválido
  (o `"30"` mantinha o logout automático inerte), o gatilho virou CRUZAMENTO do
  horário em vez de igualdade exata, o vazamento de `setInterval` foi corrigido, e
  a senha padrão de reset passou a ter UMA fonte — eram CINCO lugares, dois já
  divergindo.
  Verificado: 427 testes / 44 arquivos, 6 gates, tsc 0, eslint 0, npm audit 0,
  `next build` sem DATABASE_URL, e a tela exercitada no navegador COM o valor
  quebrado de produção semeado.
- ✅ REQ-032, passos 1 e 2 FEITOS em 2026-09-06: variáveis `NEXT_PUBLIC_SUPABASE_*`
  cadastradas na Vercel (tipo **Config**, não Secret — o prefixo público é
  intencional) e a migration do sinal aplicada no Supabase. **Mecanismo validado
  em produção** sem escrever dado: canal SUBSCRIBED, trigger disparado com
  `UPDATE ... WHERE false` (zero linhas) e sinal recebido por um cliente real.
- Próxima Ação: **MEDIR a defasagem de ≤ 500 ms — ADIADA por decisão do usuário.**
  Medi-la agora exigiria criar usuário e chave de teste e operar em produção,
  gravando registros sintéticos e PERMANENTES na trilha imutável (§7.1). Fica para
  a primeira operação real do dia a dia. **Até haver um número no `plan.md`, o
  REQ-032 está entregue em código e não em fato.**
- ✅ ENSAIO DE RESTAURAÇÃO feito em 2026-09-06: dump baixado do repositório
  privado, restaurado e conferido em **72 s**, sem erro, com estrutura e contagens
  idênticas ao registrado — e os guardas de imutabilidade EXERCITADOS na base
  restaurada, não só contados. Tabela no runbook §6.6.
- ⚠️ O RTO de 4 h ainda NÃO está medido por inteiro: faltam provisionar um projeto
  Supabase novo, repontar a aplicação e o tempo humano de perceber e decidir — as
  três etapas que exigem credencial de produção e que na prática dominam o número.
  O ensaio removeu a maior incógnita: a parte técnica leva segundos.
- ✅ **TODAS as etapas do ADR-012 estão fechadas em código** (3, 4, 5, 7a, 7b; a 6
  foi dissolvida). Não há sprint planejada. O que vier agora entra por Change
  Request.
- ✅ PR #21 merged (`d79020a`) e a Sprint 24 está VERIFICADA EM PRODUÇÃO: o deploy
  concluiu 16:14:46 UTC e, com 36 requisições em instâncias novas depois disso,
  `app_logs` NÃO recebeu nenhuma linha `cron_desativado` (parou em 61, a última
  às 15:53:02). O logout automático e a faxina da tela também estão no ar.
- ⚠️ Fora das sprints e ainda pendente: o ENSAIO DE RESTAURAÇÃO (runbook §6.6). O
  job prova que o dump volta numa base descartável, mas o RTO de 4 h NUNCA foi
  cronometrado — é o único item da §4.3 ainda não demonstrado.
- ⚠️ LIÇÃO DO GO-LIVE, e é a mais cara desta rodada: o job de backup passou em 25
  testes e falhou nas TRÊS primeiras execuções reais — extensões da plataforma no
  dump, schema `public` já existente, e token sem `Contents`. A suíte cobria a
  lógica pura de reconciliação; o que quebrou foi a orquestração em volta dela, que
  nenhum teste alcança. O `tasks.md` da Sprint 23 tinha registrado esse limite com
  todas as letras. **Job de CI só está verificado depois de rodar de verdade.**
- ⚠️ O que NÃO está demonstrado: o RTO de 4 h (ver Próxima Ação (a)). E a tabela de
  ensaios do runbook §6.6 continua com a linha em branco.
- ⚠️ Credenciais: precisam estar no gerenciador de senhas da instituição — conta
  Vercel, JWT_SECRET, senha do Supabase e o ADMIN. Sem isso o §8 (incidentes) não é
  executável por quem estiver de plantão. A senha do Supabase FOI ROTACIONADA em
  2026-09-06 (vazou num terminal); a antiga não vale mais.
- ⚠️ TESTES (dev): exigem Postgres em container — `npm run test:db:up` ANTES de
  `npx vitest`. A suíte dá TRUNCATE no MESMO banco usado para verificar no navegador.
  Parece sempre defeito de autenticação. Verificação no navegador é o ÚLTIMO passo.
  Para semear: TRUNCATE + `DATABASE_URL=... node db/bootstrap-admin.mjs` (o script
  NÃO lê o .env.local). O Docker Desktop costuma estar parado — subir antes.
- ⚠️ Migrations em produção: NÃO há runner. Aplicar à mão por `psql`, em ordem de
  nome. O que já foi aplicado se consulta em `supabase_migrations.schema_migrations`
  — mas os nomes do ledger não batem com os dos arquivos, e existe uma
  `search_path_history_imutavel_task_065` no banco SEM arquivo no repositório.
  Runbook §4.1. Migration que falta CALA em vez de gritar: conferir o schema.
- Decisões em aberto: (a) expurgar keys.db do histórico antigo do git (risco
  baixíssimo); (b) o CR de faxina da tela; (c) CR para runner de migrations.
- Arquivos não commitados: nenhum
- ⚠️ CORREÇÃO OPERACIONAL PENDENTE, independente de sprint: as 4 linhas de
  `settings` em produção são da carga SINTÉTICA da TASK-067 — eu as preservei na
  limpeza do go-live achando que eram configuração legítima, e errei.
  `auto_logout_time` = "30" é a causa do logout quebrado. Corrigir pela tela ou
  por SQL, e revisar `default_reset_password` (hoje "trocar123").
- ⚠️ DÉBITO NOVO: `docs/api-contract.md` está no mapa do projeto (logo abaixo, em
  "Localização dos artefatos principais") e NÃO EXISTE. Um critério da TASK-082
  ficou sem alvo por isso. Ou o contrato é criado, ou sai do mapa.
- ⚠️ LIÇÃO DA SPRINT 24: **validação só na fronteira de entrada assume que a
  fronteira sempre existiu.** Um `"30"` vindo de seed de teste manteve um controle
  da §2 inerte em produção, sem sintoma, porque o POST validava e a leitura não.
- Branch atual: feature/sprint-24-faxina-configuracoes (PR #21 aberto).
  PRs #15–#20 merged na main.
- Atualizado em: 2026-09-06
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
Sprint atual      : — (nenhuma ativa, e nenhuma planejada)
Última sprint     : 25 ✅ código (Etapa 5 do ADR-012 — Realtime · TASK-072, 073).
                    REQ-032 pendente de MEDIÇÃO em produção
Produção          : NO AR desde 2026-09-06 — https://projeto-uni-fafire.vercel.app
Fase atual        : 11 (operação). TODAS as etapas do ADR-012 fechadas em código:
                    3, 4, 5, 7a e 7b. A Etapa 6 foi dissolvida. Nada planejado —
                    o que vier entra por Change Request
Último commit     : (ver git log -1)
Próxima ação      : Fechar o REQ-032 (variáveis NEXT_PUBLIC_SUPABASE_* + migration
                    do sinal + MEDIR a defasagem) · Ensaio de restauração
                    (runbook §6.6, RTO não medido)
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
| Deploy | **Vercel**. O aparato local (PM2, `.bat`, `ecosystem.config.js`, `show-ip.js`, `/api/server-info`) foi REMOVIDO na TASK-079. Saúde em `/api/health`, pública e de dois campos. Passo a passo em `docs/runbook-deploy.md` |
| Testes | Vitest contra **Postgres real em container** (`npm run test:db:up`) + Playwright |
| Secrets | .env local |
| Erros | Sentry |
| Autorização | `src/proxy.ts` NEGA por padrão (API 401, página 307). Papel continua sendo do handler — §3.2 |
| Backup | **`pg_dump` diário no GitHub Actions** → repositório PRIVADO separado, verificado por RESTAURAÇÃO (contagens + esquema) numa base descartável. Cada execução é gravada em `backup_runs`. O plano gratuito do Supabase NÃO tem backup gerenciado — CR Tipo D `7770d2e` |
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
