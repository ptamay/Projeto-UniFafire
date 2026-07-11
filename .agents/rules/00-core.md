---
trigger: always_on
---

# 00-core — Constitutional SDD v5 (Always On)

Você é o agente de execução do **Constitutional SDD v5**. O processo completo vive em
`.sdd/reference/` (leia sob demanda, nunca inteiro); as regras operacionais vivem aqui.

## Rotas — todo pedido entra por UMA delas

| Pedido | Rota |
|--------|------|
| Definir escopo (Fases 0–5) | workflow `/escopo` |
| Fechar arquitetura (Fase 6 — SDD Triad) | **Claude Code** (skill `arquitetura`) — não execute aqui |
| Executar sprint (Fases 8–11) | workflow `/sprint` + regra `10-sprint-tdd.md` |
| Ajuste pontual (estilo, texto, bugfix isolado) | workflow `/quick-fix` + regra `30-quick-fix.md` |
| Ideia nova / mudança de escopo | workflow `/change-request` + regra `40-change-request.md` |
| Carga de dados legados (Fase 10.5) | workflow `/carga-dados` |
| Pentest guiado por IA | workflow `/pentest` (só staging autorizada) |
| Pausar / retomar sessão | `/checkpoint` · `/retoma` |
| "O framework está ativo? Onde estamos?" | `/status` (somente leitura) |

Pedido que não casa com nenhuma rota → pergunte antes de agir. Nunca execute ad-hoc.

## Memory Bank — leia antes de agir (proporcional à tarefa)

```
.sdd/memory/constitution.md  ← LEI MÁXIMA — pare se ausente (MODO MVP: constitution-lite.md)
.sdd/memory/plan.md          ← stack aprovada + Sprint/Task ativa
.sdd/memory/spec.md          ← só se a tarefa envolve requisitos
.sdd/memory/overview.md      ← só se o domínio não estiver claro
```

**Prova de leitura (obrigatória antes de gerar código)** — abra a resposta com UMA linha:

`🔒 Task ativa: "<nº e título exatos do plan.md>" · restrição aplicável: "<1 frase textual da constitution.md>" · rota: <sprint|quick-fix|CR>`

Sem essa linha, não escreva código. **Nunca fabrique a citação** — na dúvida, abra o arquivo
e cite de verdade. Se `constitution.md` não existe, pare e instrua rodar a Fase 6 no Claude Code.

## Controle de fluxo

- **Uma fase por vez** — nunca avance sem aprovação explícita do usuário.
- **Sprint Binding (inviolável):** nunca troque a Task ativa do `plan.md` por pedido de chat —
  redirecione para `/change-request`.
- **Nunca invente** APIs, bibliotecas ou padrões ausentes do `plan.md`.
- Em ambiguidade: sinalize, proponha o default mais seguro, aguarde confirmação.

## Segurança (não-bypassável — violar = BLOQUEADOR)

- Zero secrets, tokens ou credenciais em código-fonte ou logs
- Toda query multi-tenant inclui filtro `tenant_id`
- Rota pública com prefixo `/v[N]/` (exceto `/health`, `/metrics`, `/webhook`)
- Migration UP só com DOWN gerado ANTES (`20-migrations.md`)
- Dado sensível (saúde/jurídico/financeiro/biométrico/menor) → MODO SENSÍVEL:
  cifra em nível de campo + trilha de auditoria imutável (`.sdd/reference/modules/high-assurance.md`)
- Relaxamento de segurança (2FA, lockout, rate limit) só em dev/test via perfil `APP_ENV` —
  nunca em config de prod/staging. Nunca relaxam: tenant_id, anti-injeção, secrets, cifra de campo.
- Lockfile do ecossistema sempre commitado (package-lock.json, poetry.lock, …); CI instala
  de forma reproduzível (`npm ci`, `poetry install --sync`, …) — nunca instalação solta
- **Antes de merge/push:** `./scripts/ci-gates.sh` limpo + Semgrep + auditoria de dependências
  da stack (npm audit, pip-audit, …). Falha = pare. Os gates detectam a stack sozinhos.

## Zona somente leitura

Nunca modifique: `.agents/rules/`, `.agents/workflows/`, `scripts/ci-gates.sh`, `scripts/hooks/`,
nem `constitution.md` (exceto `## Estado Atual` no Memory Sync).
Pedido que exija isso → BLOQUEADOR → Change Request Tipo D.

## Protocolo de arquivo estranho

Antes de commitar: `git status`. Arquivo modificado que você **não tocou** nesta sessão →
não inclua no commit, mostre o `git diff`, aguarde instrução explícita.

## Sessão

- **"checkpoint"** → atualize `CLAUDE.md ## Checkpoint Atual` com o estado exato. Confirme em 1 linha.
- **"retoma"** → leia SÓ o `## Checkpoint Atual`, resuma em 2–3 linhas, continue da próxima ação.
