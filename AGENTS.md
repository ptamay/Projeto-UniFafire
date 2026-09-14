# AGENTS.md — Sistema de Gerenciamento de Chaves (UniFafire)

<!-- Constitutional SDD v5 · placeholders preenchidos na Fase 0 e na Fase 6.
     Lido por Antigravity, Gemini CLI (via GEMINI.md) e qualquer agente compatível. -->

## O que é este projeto

Controle de empréstimo e devolução de chaves das salas da Universidade UniFafire — registro auditável de quem está com qual chave, com perfis Administrador/Porteiro/Funcionário-Aluno e fluxo de dupla confirmação. Stack real: Next.js (App Router) + SQLite (better-sqlite3) + PM2 em servidor local. Detalhes: `.sdd/memory/overview.md`.

**Modo:** EXPRESSO · **Stack aprovada:** ver `.sdd/memory/plan.md`

## Mapa do framework — onde está cada coisa

| O quê | Onde |
|-------|------|
| Memória do projeto (overview, constitution, spec, plan, tasks) | `.sdd/memory/` |
| Regras de comportamento (auto-carregadas pelo Antigravity) | `.agents/rules/` |
| Comandos `/escopo` `/sprint` `/quick-fix` `/change-request` … | `.agents/workflows/` |
| Skills do Claude Code (arquitetura, sprint, carga-dados…) | `.claude/skills/` |
| Processo completo (referência — ler sob demanda) | `.sdd/reference/` |
| Gates mecânicos + git hooks | `scripts/` |

## Divisão de trabalho entre agentes

- **Antigravity / Gemini** — escopo (Fases 0–5) e sprints de volume (CRUD, UI, boilerplate).
- **Claude Code** — Fase 6 (SDD Triad), sprints 🔴 críticas (auth, RLS, financeiro, dado
  sensível), Change Requests Tipo C/D, reviews e pentest.
- A troca de canal é **decisão do usuário**, nunca automática — registre no checkpoint ao trocar.

## Regras inegociáveis (resumo — íntegra em `.agents/rules/00-core.md`)

1. Leia `.sdd/memory/constitution.md` + `plan.md` antes de gerar código — e prove com a linha 🔒.
2. Uma fase por vez; a Task ativa do `plan.md` manda (Sprint Binding).
3. TDD atômico: test red → green → refactor, um commit por passo (`test(TASK-NNN)` antes de `feat(TASK-NNN)`).
4. `./scripts/ci-gates.sh` limpo antes de qualquer merge/push.
5. Zero secrets · `tenant_id` em query multi-tenant · DOWN antes de UP · `/v[N]/` em rota pública.

## Sessão

- `/checkpoint` → salva o estado em `CLAUDE.md ## Checkpoint Atual`
- `/retoma` → retoma do checkpoint (leia só o checkpoint, não releia o projeto)
