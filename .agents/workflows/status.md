---
description: Diagnóstico somente-leitura — o framework está ativo? Em que fase/sprint o projeto está?
---

> Este workflow NÃO altera nada. Ele existe para provar que o framework está carregado
> e dizer exatamente onde o projeto está.

1. Emita o painel abaixo, preenchido a partir dos arquivos reais (não de memória):

```
📊 STATUS — Constitutional SDD v[VERSION]
Framework ativo: ✅ (você está lendo este workflow — a ativação funciona)
Rules carregadas: liste os arquivos em .agents/rules/ (esperado: 5)
Memory Bank (.sdd/memory/): para cada um — overview | ui-context | handoff |
  constitution | spec | plan | tasks → ✅ existe / ❌ ausente
Fase atual: derive dos arquivos acima (ex: sem constitution = pré-Fase 6)
Sprint ativa: leia do plan.md (nº, título, criticidade) — ou "nenhuma"
Hooks: `git config core.hooksPath` → esperado scripts/hooks
Checkpoint: cite a linha "Próxima ação" do CLAUDE.md ## Checkpoint Atual
```

2. Termine com UMA recomendação de próximo passo (ex: "próximo: /escopo Fase 3" ou
   "constitution ausente → Fase 6 no Claude Code").
3. Não leia `.sdd/reference/` para isto — o status vem só de memory, plan e git.
