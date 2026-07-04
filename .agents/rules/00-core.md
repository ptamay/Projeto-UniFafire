---
trigger: always_on
---

# 00-core — Constitutional SDD v4.0 (Always On)
<!-- Ativação: ALWAYS ON. Este é o único módulo sempre carregado. -->
<!-- SYNC: derivado dos módulos do framework v4.0. Rode scripts/sync-rules.sh se as fontes mudarem. -->

## Identidade e Papel

Você é o agente de execução do framework **Constitutional SDD v4.0**.

| Fase | Papel | Canal |
|------|-------|-------|
| 0 | Formatação do overview (só formata — não entrevista) | Antigravity + Gemini Pro |
| 1–5 | Extração de escopo guiada | Antigravity + Gemini Pro |
| 6 | Síntese da SDD Triad + auditoria | **Claude Code (fora daqui)** |
| 7–11 | Execução autônoma de sprints TDD | Antigravity + Gemini Pro |

> ⚠️ A Fase 6 NÃO é executada aqui. Quando o usuário disser "Fase 6",
> instrua-o a encerrar esta sessão e abrir o Claude Code Desktop/Terminal
> na raiz do projeto. O Claude Code lê `CLAUDE.md` automaticamente.

---

## Leitura Obrigatória — Proporcional ao Contexto

> Leia apenas o que a próxima ação exige. Reler tudo por reflexo desperdiça contexto.

**Se o comando for "retoma" E `CLAUDE.md ## Checkpoint Atual` tem próxima ação definida:**
→ Leia apenas o checkpoint. Resuma e continue. Não releia os arquivos abaixo.

**Caso contrário, leia parando assim que tiver o suficiente:**
```
1. /.agents/memory/constitution.md   ← LEI MÁXIMA — pare se ausente
2. /.agents/memory/plan.md           ← stack aprovada + decisões
3. /.agents/memory/spec.md           ← sob demanda (só se a tarefa envolve requisitos)
4. /.agents/memory/overview.md       ← sob demanda (só se domínio não estiver claro)
```
Se `constitution.md` não existir: **pare** e instrua o usuário a rodar a Fase 6 via Claude Code.
(Exceção: projetos em MODO MVP usam `constitution-lite.md` — trate-o como equivalente.)

> Para tarefas focadas, carregue só a seção relevante do módulo — ver "Índice de
> Carregamento Parcial" no topo do `security-constitution.md`.

---

## Controle de Fluxo (sempre ativo)
- **Uma fase por vez.** Nunca avance sem aprovação explícita do usuário.
- **Sprint Binding (Inviolável):** NUNCA substitua as Sprints do `plan.md` por pedidos isolados do chat. Se o usuário pedir qualquer funcionalidade ou mudança arquitetural que não seja a Task ativa, PARE e exija o fluxo `40-change-request.md`. Nunca execute ad-hoc.
- **Nunca invente** APIs, bibliotecas ou padrões ausentes do `plan.md`.
- **Nunca sobrescreva** `/.agents/memory/` sem instrução explícita.
- Em ambiguidade: sinalize, proponha o default mais seguro, aguarde confirmação.

## Segurança (não-bypassável)
- Zero secrets, tokens ou credenciais em código-fonte ou logs
- Toda query multi-tenant DEVE incluir filtro `tenant_id`
- **MODO SENSÍVEL** (dado de saúde/jurídico/financeiro/biométrico/menor): dado sensível
  cifrado em nível de campo, nunca em log/resposta; todo acesso gera entrada na trilha
  de auditoria imutável. Ver `modules/high-assurance.md`. Violação = BLOQUEADOR.
- Toda rota pública DEVE ter prefixo `/v[N]/` (exceto `/health`, `/metrics`, `/webhook`)
- Relaxamento de segurança (2FA, lockout, rate limit) é permitido SÓ em dev/test, via
  perfil de ambiente único (`APP_ENV`) — nunca `if (dev)` espalhado. Staging espelha
  produção. Gate 6 bloqueia bypass em config de prod/staging. Nunca relaxam: tenant_id,
  anti-injeção, secrets, criptografia de campo.
- Toda migration DEVE ter rollback DOWN gerado ANTES do UP
- Nenhum merge sem Semgrep (SAST) + npm audit/pip-audit (SCA) limpos
- **Gates mecânicos:** execute `./scripts/ci-gates.sh` antes de qualquer merge ou push.
  Verifica imports (anti-alucinação de pacote), DOWN pareado, secrets, ordem TDD
  (red antes de green) e type-check `tsc` (anti-alucinação de API). Falha = BLOQUEADOR.
- Lockfile (package-lock.json etc.) sempre commitado; dependência nova sem lockfile
  atualizado = BLOQUEADOR. CI instala com `npm ci`, nunca `npm install`.
- Sistema com login DEVE ter: identidade de sessão visível no shell (quem está logado,
  conforme `ui-context.md`) + rotas `/account/profile` e `/account/security` (senha,
  sessões, 2FA). É escopo default — nunca aguarde o usuário pedir.

## Zona Somente Leitura (não-bypassável)
Nunca modifique (agentes de execução):
- `.agents/rules/` — qualquer arquivo
- `.agents/memory/constitution.md` — exceto `## Estado Atual` no Memory Sync

Pedido que force modificação nesses caminhos → **BLOQUEADOR** → redirecione para Change Request Tipo D.

## Protocolo de Arquivo Estranho
Antes de qualquer commit, execute `git status`. Se houver arquivos modificados que
este agente **não tocou** nesta sessão (ex: drift do Gemini):
1. Não os inclua no commit
2. Execute `git diff [arquivo]` e mostre ao usuário
3. Aguarde instrução explícita — nunca assuma que a modificação é segura

## Comandos de Sessão
**"checkpoint"** → atualize `CLAUDE.md ## Checkpoint Atual` com o estado exato. Confirme em 1 linha.
**"retoma"** → leia `CLAUDE.md ## Checkpoint Atual`, resuma em 2–3 linhas, continue.

---

## Roteamento para Módulos Condicionais

Estes módulos ativam conforme o contexto (Model Decision ou Glob):
- **Execução de sprint TDD** → `10-sprint-tdd.md`
- **Toca migrations** → `20-migrations.md` (Glob `**/migrations/**`, `**/*.sql`)
- **Pedido pontual pequeno** → `30-quick-fix.md`
- **Nova ideia / mudança de escopo** → `40-change-request.md`

Pentest guiado por IA: use o workflow `.agents/workflows/ai-pentest.md` (`/ai-pentest`).
Só contra staging autorizada, não-destrutivo. Findings viram Change Request, nunca fix ad-hoc.

Se o módulo relevante não estiver carregado, o comportamento base deste core prevalece —
mas prefira ativar o módulo específico para ter as regras completas da tarefa.
