---
trigger: model_decision
description: "Ative OBRIGATORIAMENTE quando a tarefa for executar tasks de sprint, rodar o ciclo TDD, ou orquestrar os sub-agentes das Fases 10-11."
---

# 10-sprint-tdd — Execução de Sprint (Model Decision)

## TDD Atômico (inviolável)
Para CADA task:
1. Escreva UM teste falho → confirme falha → commite
2. Implemente o mínimo para passar → confirme → commite
3. Refatore → confirme que ainda passa → commite
4. Só então avance para a próxima task

Violação = BLOQUEADOR — pare e notifique o usuário.
A ordem é verificada mecanicamente: o Gate 4 do `ci-gates.sh` bloqueia o push se
qualquer `feat(TASK-NNN)` não tiver um `test(TASK-NNN)` anterior no histórico.
O hook `commit-msg` bloqueia commits `feat`/`test` sem escopo `(TASK-NNN)`.

---

## Sub-Agentes e Esforço por Step

> O Antigravity orquestra 5 sub-agentes em sequência. Cada um carrega o contexto
> mínimo da sua responsabilidade e recebe instrução de esforço explícita.

### 🤖 task-agent — Steps 0–1 (Context Load + Ingest)
> ⚡ ESFORÇO BAIXO — Leitura e ordenação. Não gere código.
- Carrega: `constitution.md` + `spec.md` + `plan.md` + `tasks.md` + títulos de ADRs + `ui-context.md` (se UI)
- **Branch antes do 1º commit:** leia o nº da sprint em `plan.md`, crie `feature/sprint-[N]-[slug]`
  Ex: `feature/sprint-10-auth-flow`. O `[N]` vem do `plan.md` — nunca de contador automático.
- Lista tasks em ordem de dependência; rejeita camadas horizontais, aceita fatias verticais

### 🤖 code-agent — Steps 2–5 (Red, Green, Refactor, Migrate)
> 🔴 ESFORÇO MÉDIO a ALTO — uma task por vez, contexto resetado a cada task.
- `constitution.md` já está em contexto desde o Step 0 — **não recarregue entre tasks**
  (recarregue só se a sessão foi interrompida)
- Carregue por task: task atual + arquivos sendo implementados
- Task L ou com Migrate: confirme que `constitution.md` está em contexto antes de implementar
- Migrate: script DOWN gerado ANTES do UP, sempre. Ver `20-migrations.md`.

### 🤖 review-agent — Steps 6–8 (Validate, Security Gate, AI Validation Gate)
- Validate (6): ⚡ BAIXO — execute testes, leia cobertura
- Security Gate (7): ⚡ BAIXO — Semgrep + npm audit + `./scripts/ci-gates.sh` (Gates 1–6)
- AI Validation Gate (8): 🔴 **ESFORÇO MÁXIMO — não responda imediatamente:**
  > 1. Releia critérios BDD desta task no `tasks.md`
  > 2. Compare com o código commitado nos Steps 2–4
  > 3. Verifique ADRs relevantes em `/docs/adr/`
  > 4. Confirme que nenhuma biblioteca/API foi usada fora do `plan.md`
  > 5. Só então responda SIM/NÃO: spec compliance, requirement drift,
  >    ADR compliance, hallucination proxy check
  > Esforço baixo aqui invalida todo o ciclo TDD anterior.

### 🤖 report-agent — Step 9 (Report)
> ⚡ ESFORÇO BAIXO — sumarize o que já aconteceu. Não releia arquivos.
- Tasks concluídas | testes | Security Gate | AI Validation Gate (a–d) | bloqueios

### 🤖 memory-agent — Step 10 (Memory Sync — obrigatório)
> ⚡ ESFORÇO BAIXO — atualize só o que mudou.
```
a. constitution.md → ## Estado Atual
b. plan.md → sprint ✅ + decisões + AI Cost Budget
   + ## Métricas do Processo: linha da sprint (datas via git log, pts plan./entr.,
     retrabalho, falhas de gate; bugs pós-release da sprint anterior retroativo)
c. CLAUDE.md → ## Estado atual do projeto
d. commit: chore: memory sync sprint-N
```
Sprint não encerra sem este commit. Se arquivo de memória ausente: crie com conteúdo mínimo.

---

## Definition of Done (task pronta só quando TUDO for verdade)
- [ ] Critérios BDD do `tasks.md` atendidos e verificados
- [ ] Cobertura ≥ 80% | Lint zero erros
- [ ] Semgrep zero HIGH/CRITICAL | npm audit zero HIGH/CRITICAL CVEs
- [ ] `./scripts/ci-gates.sh` passou (imports, DOWN pareado, secrets, ordem TDD, type-check, bypass de ambiente)
- [ ] Lockfile atualizado e commitado se dependência nova foi adicionada
- [ ] Tenant isolation verificada (multi-tenant)
- [ ] API versionada (`/v[N]/`)
- [ ] Migration com rollback testado no branch Neon (se aplicável)
- [ ] Zero secrets em código ou logs
- [ ] Security headers (helmet.js ou next-safe) + rate limiting em rotas públicas/auth
- [ ] E2E smoke passou se a task toca fluxo crítico do overview.md (Playwright — bloqueante no PADRÃO)
- [ ] Se a task entrega/altera login: identidade de sessão no shell + rotas `/account/*` presentes
