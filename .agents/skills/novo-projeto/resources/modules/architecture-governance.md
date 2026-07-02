# architecture-governance.md
> **Módulo:** Architecture Governance | **Versão:** 4.0
> **Carregado em:** Fase 6 (Opus) | Fases 7–9 (setup + tasks)
> **Depende de:** `master-spec-core.md` + `modules/security-constitution.md`

Este módulo contém a stack de referência PME validada e o mapa completo de artefatos gerados. O Opus usa este módulo na Fase 6 para auditar conformidade de stack. Os agentes das Fases 7–9 usam o Mapa de Artefatos para saber onde salvar cada output.

---

## 1. Stack de Referência PME — Visão Consolidada

> *Leitura obrigatória antes da Fase 6. Esta é a stack padrão validada para projetos PME com o modelo Solo Developer + IA. Use como ponto de partida — desvie apenas com justificativa registrada em `plan.md`.*

---

### Camada 1 — Frontend
| Ferramenta | Função | Free? |
|-----------|--------|-------|
| **Next.js** | Framework React full-stack | ✅ |
| **Tailwind CSS** | Estilização utilitária | ✅ |
| **shadcn/ui** | Biblioteca de componentes headless | ✅ |
| **Lucide Icons** | Ícones consistentes com shadcn | ✅ |
| **Sonner** | Toasts / notificações | ✅ |
| **next-themes** | Dark/light mode | ✅ |
| **next-safe** | Security headers automáticos | ✅ |

> **Regra de Ouro do Frontend:** configurações globais (Tailwind config, globals.css, fontes) e esqueletos de rotas vazios SEMPRE antes de qualquer estilização de componente individual.

---

### Camada 2 — Backend e Banco de Dados
| Ferramenta | Função | Free? |
|-----------|--------|-------|
| **Prisma** | ORM type-safe | ✅ |
| **PostgreSQL via Supabase** | Banco principal + Auth + Storage | ✅ free tier |
| **Supabase Auth** | Autenticação (email, OAuth, magic link) | ✅ |
| **Supabase Storage** | Upload de arquivos | ✅ |
| **Neon** | Banco efêmero para CI/CD (branches por PR) | ✅ free tier |

---

### Camada 3 — Infraestrutura e Deploy
| Ferramenta | Função | Free? |
|-----------|--------|-------|
| **Vercel** | Hospedagem frontend + serverless | ✅ free tier |
| **Railway** | Hospedagem backend / workers | ✅ free tier |
| **GitHub Actions** | CI/CD pipeline | ✅ |
| **Doppler** | Secrets manager | ✅ free tier |
| **Cloudflare** | CDN + WAF + DDoS + Bot Protection | ✅ free tier |

---

### Camada 4 — Observabilidade e Qualidade
| Ferramenta | Função | Free? |
|-----------|--------|-------|
| **Sentry** | Monitoramento de erros (5k erros/mês) | ✅ free tier |
| **PostHog** | Analytics de produto (1M eventos/mês) | ✅ free tier |
| **Vercel Analytics** | Performance de páginas | ✅ free tier |
| **Semgrep** | SAST — análise estática de segurança | ✅ |
| **npm audit / pip-audit** | SCA — vulnerabilidades em dependências | ✅ nativo |
| **Upstash Redis** | Rate limiting distribuído | ✅ free tier |

---

### Camada 5 — Orquestração de IA
| Ferramenta | Fase | Função |
|-----------|------|--------|
| **Gemini Pro** | 1–5 e 7–11 | Extração de escopo, geração de código, execução de sprints |
| **Claude Opus** | 6 | Síntese da SDD Triad + auditoria de consistência |
| **Antigravity** | 7–11 | Orquestração autônoma de agentes + sandbox |

---

### Critério de Desvio da Stack Padrão

Se qualquer ferramenta desta stack for substituída, registrar obrigatoriamente em `plan.md`:

```
## Decisões e Justificativas
| Ferramenta padrão | Substituída por | Motivo |
|------------------|----------------|--------|
| Supabase Auth | Auth0 | Cliente já usa Auth0 em outros sistemas |
```

Sem registro → o agente assume a stack padrão sem questionar.

---

## 2. Mapa de Artefatos Gerados

**Fluxo de rastreabilidade entre artefatos:**
```
overview.md → spec.md → tasks-[sprint].md → commits (feat/TASK-NNN)
                ↓               ↓
            plan.md         sprint-execution.md
                ↓                    ↓
        constitution.md ← (lido por todos os agentes antes de qualquer ação)
                ↓
        ui-context.md   ← (lido por todos os agentes de UI — gerado na Fase 4.0)
        handoff.md      ← (lido pelo Opus no início da Fase 6)
        adr/*.md        ← (lido quando decisão arquitetural é questionada)
        .semgrep/fitness.yml ← (executado em todo PR via CI)
        releases/*.md   ← (gerado antes de cada deploy para produção)
        CLAUDE.md       ← (lido pelo Claude Code ao iniciar — atualizado pelo Memory Sync)
```

**Fluxo de geração e consumo do `ui-context.md`:**
```
Fase 4.0 (geração):
  Gemini/GPT-4o Vision analisa /assets/brand/logo.svg
  → extrai paleta + tom visual
  + Gemini/GPT-4o gera layout shell JSON
  → agente gera e salva /.agents/memory/ui-context.md

Consumo (todas as sprints com componentes UI):
  Step 0 do sprint-execution.md carrega ui-context.md
  → agente usa tokens CSS, shell e tipografia como contexto fixo
  → nenhum componente é gerado sem este contexto carregado
```

| Artefato | Fase | Localização | Propósito |
|---|---|---|---|
| `VERSION` | bootstrap | `/.agents/` | Versão do framework copiada do template — comparada pelo `atualizar-projeto.ps1` para detectar projeto desatualizado |
| `proposta-[cliente].md` | Comercial | `/docs/` (após criação do projeto) | Proposta com escopo macro, preço, prazo e exclusões explícitas |
| `overview.md` | 0 | `/.agents/memory/` | Contexto inicial do projeto em linguagem humana formatada |
| `threat_model_stride.md` | 3 | `/docs/` | Auditoria de segurança + cross-tenant risks |
| `ui-context.md` | 4.0 | `/.agents/memory/` | Identidade visual e layout shell — contexto fixo para todos os agentes de UI |
| `handoff.md` | 5 | `/.agents/memory/` | Resumo compacto de escopo das Fases 1–5 para transição Gemini → Opus |
| `constitution.md` | 6 | `/.agents/memory/` | Lei máxima dos agentes |
| `spec.md` | 6 | `/.agents/memory/` | O Quê & Por Quê + métricas de negócio |
| `plan.md` | 6 | `/.agents/memory/` | Como & Roadmap + Decisões e Justificativas |
| `api-contract.md` | 6 | `/docs/` | Contrato de API versionada (se aplicável) |
| `mcp_config.json` | 7 | `/.agents/` | Governança de ferramentas MCP |
| `agent_config.py` | 7 | `/.agents/` | Sandbox deny-by-default |
| `CLAUDE.md` | 7 | `/` (raiz) | Bootstrap de contexto para Claude Code — atualizado automaticamente pelo Memory Sync ao fim de cada sprint |
| `tasks-[sprint].md` | 9 | `/docs/` | Micro-spec BDD + verificação de tenant + backlog de próxima sprint |
| `sprint-execution.md` | 10 | `/.agents/workflows/` | Workflow autônomo Antigravity (inclui Step 10 — Memory Sync) |
| `supabase/migrations/*.sql` | 10 | `/supabase/migrations/` | Migrations UP — timestamp deve casar com o DOWN pareado |
| `db/migrations/*.sql` | 10 | `/db/migrations/` | Scripts DOWN (rollback) pareados por timestamp com o UP correspondente |
| `adr/ADR-NNN-*.md` | 6 | `/docs/adr/` | Architecture Decision Records — racional de decisões não-óbvias (MODO PADRÃO) |
| `event-catalog.md` | 6 | `/docs/` | Catálogo de eventos com nome, versão e payload (MODO PADRÃO, quando há async) |
| `.semgrep/fitness.yml` | 6 | `/` | Fitness functions: regras Semgrep de saúde arquitetural contínua (MODO PADRÃO) |
| `releases/release-[v].md` | 11 | `/docs/releases/` | Release governance: changelog, risco, rollback plan e feature flags |
| `renovate.json` | 7 | `/` (raiz) | Atualização automática de dependências — patch automerge com CI verde |
| `config/security-profile.ts` | 5 | `/config/` | Fonte única do enforcement por ambiente (dev/test/staging/prod) — controles leem daqui, nunca checam ambiente sozinhos |
| `runbook.md` | 11 (go-live) | `/docs/` | Operação e incidentes pós-entrega — serviços, severidades, rollback, backup |
| `migration/migration-plan.md` | 10.5 | `/docs/migration/` | Plano de carga inicial: fonte, volume, estratégia, corte, janela |
| `migration/data-mapping.md` | 10.5 | `/docs/migration/` | Mapa campo-a-campo origem→destino da carga inicial |
| `migration/reconciliation-report.md` | 10.5 | `/docs/migration/` | Reconciliação pós-carga: contagem, integridade, amostra, aceite |
| `security/pentest-report-[data].md` | pré go-live / anual | `/docs/security/` | Relatório do AI Red Team — findings, evidência, cobertura e limites |
| `data-classification.md` | 3/6 (SENSÍVEL) | `/docs/` | Inventário de campos sensíveis + finalidade — nada sensível fora desta lista |
| `compliance/ropa.md` | 6 (SENSÍVEL) | `/docs/compliance/` | Registro de Operações de Tratamento (LGPD Art. 37) — revisão do DPO |
| `compliance/dpia.md` | 6 (SENSÍVEL) | `/docs/compliance/` | Relatório de Impacto à Proteção de Dados (LGPD Art. 38) — revisão jurídica |
| `e2e/*.spec.ts` | 10 | `/e2e/` | Smoke tests Playwright dos fluxos críticos do overview.md |

---
