> 📚 REFERÊNCIA — conteúdo v4 preservado. Onde este texto disser `.agents/memory` leia `.sdd/memory`. Estrutura v5: `.agents/` = só rules+workflows do Antigravity · skills em `.claude/skills/` · memória e referência em `.sdd/` (ver README da raiz). Leia este arquivo POR SEÇÃO, nunca inteiro.

# fleet-operations.md
> **Módulo:** Fleet Operations — Operação Pós-Entrega | **Versão:** 4.1
> **Carregado em:** go-live de qualquer sistema | manutenção mensal | incidente em produção
> **Depende de:** `master-spec-core.md`
> **Papel:** Transformar "entreguei um sistema" em "opero uma frota de sistemas de clientes".
> Software comercializado sem manutenção vira passivo jurídico e reputacional — este módulo
> é o que sustenta o modelo de negócio depois que o código está em produção.

---

## 1. Handoff para Operação (obrigatório no primeiro go-live de produção)

Na primeira release em produção de qualquer sistema, gere `docs/runbook.md`:

```markdown
# runbook.md — [Nome do Sistema] ([Cliente])

## Serviços e Acessos
| Serviço | URL/Dashboard | Conta | Plano |
|---------|--------------|-------|-------|
| Produção | [url] | — | — |
| Vercel | [dashboard] | [conta] | free/pro |
| Supabase/Railway | [dashboard] | [conta] | free/pro |
| Sentry | [dashboard] | [conta] | free |
| PostHog | [dashboard] | [conta] | free |
| Cloudflare | [dashboard] | [conta] | free |
| Doppler | [dashboard] | [conta] | free |

## Procedimento de Incidente
| Severidade | Critério | Primeira ação | SLA de resposta |
|-----------|----------|---------------|-----------------|
| 🔴 Crítico | Sistema fora do ar ou vazamento de dados | Rollback (ver abaixo) + avisar cliente | [X horas — do contrato] |
| 🟡 Alto | Fluxo crítico falhando p/ parte dos usuários | Investigar Sentry, hotfix/* se preciso | [X horas] |
| 🟢 Normal | Bug sem impacto em fluxo crítico | Vira Quick Fix ou task da próxima janela | próxima manutenção |

**Rollback:** revert do PR no GitHub → deploy automático da versão anterior.
Migration: `prisma migrate resolve --rolled-back [nome]` (DOWN pareado em db/migrations/).
**"Under Attack Mode"** (DDoS): ativar no painel Cloudflare.

**Incidente de dados (MODO SENSÍVEL — LGPD Art. 48):** se houver suspeita de vazamento
de dado sensível: (1) conter e preservar evidência via trilha de auditoria; (2) avaliar
risco ao titular; (3) notificar a ANPD e os titulares no prazo legal; (4) registrar todo
o incidente. Este fluxo é ensaiado, não improvisado — ver `modules/high-assurance.md` §5.

## Backup e Restore
- Backup automático: [Supabase daily | Neon PITR | pg_dump cron]
- RPO/RTO contratados: [X / X] (fonte: constitution.md)
- Último teste de restore: [YYYY-MM-DD] ← testar 1x por trimestre

## Contatos
- Cliente (decisor): [nome, canal, horário]
- Responsável técnico: você
```

> O runbook é o que evita operar no improviso às 22h de sexta. Preenchê-lo leva 15 min
> no go-live; improvisá-lo durante um incidente custa horas e credibilidade.

---

## 2. Ciclo de Manutenção Mensal (por cliente, ~30–60 min)

Checklist executável com Claude Code na raiz do projeto (diga "manutenção mensal"):

```
1. DEPENDÊNCIAS  — revisar PRs abertos do Renovate: patches já automesclados
                   (CI verde); minor/major → revisar changelog, aprovar ou adiar
2. SEGURANÇA     — npm audit / pip-audit: zero HIGH/CRITICAL novos
3. ERROS         — triage do Sentry: novos erros → Quick Fix ou task; recorrentes → CR
4. UPTIME/PERF   — Vercel Analytics: p95 dos endpoints críticos dentro do gate
5. BACKUP        — backup rodando? Trimestre: teste de restore real
6. CUSTO         — uso vs. free tiers (Sentry 5k, PostHog 1M, Supabase) e vs. cost_model.md
7. FROTA.md      — registrar data, achados e próxima janela
8. COMMIT        — chore(MAINT): manutenção mensal YYYY-MM — [resumo em 1 linha]
```

> Itens 1–2 são o mínimo inegociável. Um sistema 6 meses sem atualização de
> dependências tem CVEs conhecidas quase por definição — e o contrato de manutenção
> existe exatamente para cobrir esse trabalho.

**MODO SENSÍVEL — adições trimestrais** (ver `modules/high-assurance.md`):
- Recertificação de acesso: revisar quem tem acesso a dado sensível; revogar o não
  recertificado.
- Teste de restore de backup cifrado (não apenas confirmar que o backup existe).
- Revisão da trilha de auditoria e dos alertas de anomalia — dispararam quando deviam?

**Anual (na janela do aniversário do go-live):** rode o **AI Red Team** (`modules/ai-pentest.md`)
contra a staging — pentest white-box guiado pelos artefatos do sistema. Para sistemas com
dados sensíveis/pagamento, complemente com pentest humano. Findings viram Change Request
(Tipo C/D), nunca correção ad-hoc. Registre a data e o tipo (IA / humano) no `runbook.md`
e o resultado na FROTA.md (status 🟡 até quitar os Críticos).

---

## 3. FROTA.md — Visão Única dos Sistemas em Operação

Mantenha em `E:\@Projetos\FROTA.md` (junto ao template mestre, fora dos projetos):

```markdown
# FROTA — Sistemas em Operação

| Cliente | Sistema | Modo | Framework | Go-live | Última manut. | Próxima | Status | Contrato |
|---------|---------|------|-----------|---------|---------------|---------|--------|----------|
| [nome] | [sistema] | Padrão | v4.1.0 | 2026-08-01 | 2026-09-01 | 2026-10-01 | 🟢 | manutenção mensal |
```

- **Status:** 🟢 saudável | 🟡 com pendência (dependência major adiada, erro recorrente) | 🔴 incidente aberto
- **Framework:** compare com `.agents\VERSION` do template — projeto defasado →
  rodar `atualizar-projeto.ps1` na próxima janela de manutenção
- Um sistema 🟡 por dois ciclos seguidos vira prioridade do ciclo seguinte

---

## 4. Canais — Nada Entra Fora Deles

| Situação | Canal |
|----------|-------|
| Bug pequeno sem schema | Quick Fix (`30-quick-fix.md`) |
| Cliente pediu mudança/feature | Change Request (`40-change-request.md`) — mesmo em manutenção |
| Incidente em produção | Runbook (Seção 1) → depois post-mortem de 5 linhas no runbook |
| Atualização de dependência | Renovate + janela mensal (Seção 2) |

> Manutenção NÃO é porta de escopo grátis: "já que está mexendo, adiciona X" = Change
> Request com orçamento próprio. O contrato de manutenção cobre saúde, não evolução.

---

## 5. Contrato de Manutenção — Mínimo a Formalizar

Antes do go-live, acorde por escrito com o cliente:

1. **Escopo incluso:** ciclo mensal (Seção 2), correção de bugs 🟢, resposta a incidentes
2. **Escopo excluso:** features novas, mudanças de comportamento, integrações novas
   (→ orçamento por Change Request)
3. **SLA de resposta por severidade** (preencher tabela do runbook — seja realista:
   você é um; "resposta em 4h úteis" ≠ "resolução em 4h")
4. **Vigência e valor mensal** — sistema sem contrato de manutenção ativo = sem SLA;
   registre isso no FROTA.md e no runbook
5. **Responsabilidade de backup** (já exigido pelo constitution.md — DR)
