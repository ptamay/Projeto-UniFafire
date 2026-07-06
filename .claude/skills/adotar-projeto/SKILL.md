---
name: adotar-projeto
description: Use this skill to adopt an EXISTING project (vibe-coded or legacy) into the
  Constitutional SDD v5 framework, or to re-sync a project's framework files with the master
  template. Triggers include 'adotar projeto', 'sincronizar projeto', 'trazer projeto para o
  framework', 'projeto existente', 'vibe coding', 'regularizar projeto', 'atualizar framework
  do projeto', '/adotar-projeto'. Runs in Claude Code at the project root.
---

## Papel

Trazer um projeto que nasceu FORA do framework (vibe coding, legado) para dentro do
Constitutional SDD v5 — estrutura + memória reconstruída por engenharia reversa — ou
**re-sincronizar** um projeto v5 com o template mestre. Modelo recomendado: **Opus**
na etapa de síntese (passo 4).

## Fluxo

1. **Segurança primeiro:** confirme que está na raiz do projeto certo. `git status` —
   working tree sujo → commit ou stash ANTES de qualquer cópia. Sem git → `git init` + commit
   do estado atual ("chore: snapshot pré-adoção"). NUNCA adote sem snapshot reversível.

2. **Inventário (só leitura):** stack (package.json / requirements / etc.), testes existem?,
   pastas de migrations, arquivos `.env*`, `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` já existentes,
   e — se já há `.sdd/` — a `VERSION` do framework no projeto vs. no template.

2b. **Nível de adoção — pergunte antes de copiar:**
   - **Mínimo** — só `.sdd\memory\` reconstruída + `/status`: para experimentos que você
     ainda não decidiu governar. Pode subir de nível depois re-rodando esta skill.
   - **Padrão** — Mínimo + rules, workflows, skills e contextos (`AGENTS.md` etc.).
   - **Completo (default)** — Padrão + hooks, gates e Sprint 0 de regularização.

3. **Estrutura** — localize o template SEM caminho fixo: (a) ponteiro
   `%USERPROFILE%\.claude\sdd-template-path.txt`; (b) pergunte ao usuário e grave no
   ponteiro. Valide (`VERSION` + `.agents\rules\` existem no caminho). Então:
   - **Adoção nova:** copie `.agents\`, `.claude\`, `.sdd\reference\`, `scripts\`, `VERSION`;
     crie `.sdd\memory\`. `AGENTS.md`/`CLAUDE.md`/`GEMINI.md` já existentes NUNCA são
     sobrescritos — acrescente as seções do framework ao conteúdo atual e mostre o diff.
   - **Re-sync (projeto já v5):** atualize SÓ `.agents\`, `.claude\skills\`, `.sdd\reference\`
     e `scripts\` a partir do template. `.sdd\memory\` e os contextos personalizados são
     INTOCÁVEIS. Mostre o que mudou e atualize a `VERSION` do projeto.

4. **Memória por engenharia reversa (adoção nova — o coração desta skill):**
   a. `overview.md` — a partir de README, rotas e modelos de dados reais. Marque
      `<!-- PROVISÓRIO — validar com o usuário -->` no topo.
   b. Classifique o **modo** (Seção 4 de `.sdd/reference/master-spec-core.md`) e aplique a
      Fase 6 no que JÁ EXISTE: `constitution.md` (ou `constitution-lite.md` no MVP)
      refletindo a stack real — não a ideal; `spec.md` com os requisitos que o código já
      implementa (REQ-NNN); `plan.md` com **Sprint 0 — Regularização** listando os gaps.
   c. Apresente os três para aprovação explícita — memória provisória não governa sprint.

5. **Baseline mecânico:** rode `.\scripts\install-hooks.ps1` e depois `./scripts/ci-gates.sh`.
   Falhas aqui são NORMAIS num projeto adotado — não bloqueiam a adoção: cada falha vira
   item da Sprint 0 no `plan.md` (secrets hardcoded e PII exposta são os únicos que exigem
   ação IMEDIATA antes do próximo push).

6. **Feche:** commit `chore: adota Constitutional SDD v5` + relatório final — o que foi
   adotado, o que é provisório, débitos da Sprint 0 em ordem de risco, e:
   > "Abra o Antigravity neste workspace e digite `/status` para confirmar a ativação."

## Regras

- Adoção descreve o projeto COMO ELE É — a constitution reflete a stack real; melhorias
  entram como débito na Sprint 0, nunca como reescrita silenciosa.
- Nada de refatorar código durante a adoção. Adoção = estrutura + memória + baseline. Só.
- Em monorepo ou estrutura ambígua, pergunte onde é a raiz antes de copiar.
