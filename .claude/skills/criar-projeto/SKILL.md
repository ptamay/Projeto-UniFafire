---
name: criar-projeto
description: Use this skill to bootstrap a brand-new Constitutional SDD v5 project workspace —
  create the folder structure, copy the framework template, git init, install hooks and verify
  everything before Phase 0. Triggers include 'criar projeto', 'novo workspace', 'bootstrap',
  'montar a estrutura', 'primeiro projeto', '/criar-projeto', or when the user wants to start
  a project and the framework structure does not exist yet.
---

## Papel

Criar o workspace de um projeto novo **perfeito e verificado**, antes de qualquer fase.
Esta skill dirige o script determinístico e depois VERIFICA o resultado — nunca confie
na cópia sem conferir.

## Fluxo

1. **Pergunte o nome do projeto** (se não veio no pedido) e confirme o destino com o
   usuário — default: `<base de projetos>\<Nome>`, onde a base vem de `$env:SDD_PROJECTS_BASE`
   ou da preferência do usuário (ex.: `E:\@Projetos`). Pasta já existe → pare e sugira a
   skill `adotar-projeto`.

2. **Localize o template — NUNCA assuma caminho fixo.** Ordem de resolução:
   (a) leia o ponteiro `%USERPROFILE%\.claude\sdd-template-path.txt`;
   (b) se esta skill roda de dentro de um template/projeto, suba diretórios até achar a
   raiz que contém `VERSION` + `.agents\rules\` + `novo-projeto.ps1`;
   (c) pergunte ao usuário o caminho e **grave-o no ponteiro** para as próximas vezes.
   Valide sempre: o caminho resolvido contém `VERSION` e `.agents\rules\`? Senão → (c).

3. **Execute a cópia** — prefira o script determinístico:
   `& "<template>\novo-projeto.ps1" -Nome "<Nome>"`.
   Se o script não existir, faça manualmente os mesmos passos: copiar o conteúdo do template
   (exceto `novo-projeto.ps1`) para a raiz do projeto, criar `.sdd\memory`, `assets\brand`,
   `docs\adr` (com `.gitkeep`), `git init -b main`, rodar `scripts\install-hooks.ps1`,
   commit inicial `chore: bootstrap Constitutional SDD v5`.

4. **VERIFIQUE — checklist mecânico (emita o resultado item a item):**
   - [ ] `.agents\rules\` contém exatamente 5 arquivos (00, 10, 20, 30, 40)
   - [ ] `.agents\workflows\` contém 9 workflows
   - [ ] `.claude\skills\` contém 8 skills
   - [ ] `.sdd\memory\` e `.sdd\reference\modules\` existem
   - [ ] `git config core.hooksPath` retorna `scripts/hooks`
   - [ ] `git log --oneline` mostra o commit inicial
   - Qualquer item falhou → corrija ANTES de prosseguir e re-verifique.

5. **Personalize:** substitua `[Nome do Projeto]` em `AGENTS.md` e `CLAUDE.md` pelo nome
   real. Se o usuário já descreveu o sistema nesta conversa, ofereça iniciar a **Fase 0**
   agora (skill `novo-projeto` — formatar o overview). Commit `docs: personaliza contexto`.

6. **Encerre com as instruções de verificação cruzada:**
   > "Estrutura criada e verificada. Abra o Antigravity com o workspace em
   > `E:\@Projetos\<Nome>` e digite `/status` — se ele responder com o painel do
   > framework, a ativação está confirmada. Depois `/escopo` para as Fases 0–5
   > (ou continue aqui com a skill `novo-projeto`)."

## Regras

- Nunca crie o projeto DENTRO do template ou de outro projeto — sempre em `E:\@Projetos\<Nome>`.
- Nunca prossiga com checklist falhando — estrutura meio-copiada é pior que nenhuma.
- Esta skill NÃO executa fases — ela entrega o terreno pronto e passa o bastão.
