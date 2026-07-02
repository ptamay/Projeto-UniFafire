---
trigger: glob
---

# 20-migrations — Regras de Migration (Glob)
<!-- Ativação: GLOB. Padrão: **/migrations/**, **/*.sql -->
<!-- Dispara automaticamente quando qualquer arquivo de migration é tocado. -->

> ⚠️ Este arquivo trata de **migration de SCHEMA** (altera a estrutura do banco).
> Para **carga inicial de conteúdo** (trazer dados legados de planilha/sistema antigo),
> ver Fase 10.5 em `sprint-governance.md` — protocolo diferente (dry-run, idempotência,
> reconciliação, aceite do cliente).

## Regra Inegociável de Migration

Toda migration UP DEVE ter um DOWN (rollback) pareado — sem exceção, mesmo para
mudanças pequenas.

### Protocolo obrigatório
1. **Gere o DOWN ANTES do UP** — nunca aplique um UP sem o rollback pronto
2. **O DOWN restaura o estado EXATO anterior** — não um estado aproximado
3. **Pareamento por timestamp:** cada arquivo em `supabase/migrations/` tem um par
   em `db/migrations/` com o mesmo prefixo de timestamp
4. **Teste no branch Neon efêmero** do PR antes de considerar a migration segura
5. **Nunca aplique em produção** sem rollback verificado

### Perda de dados irreversível
Se o UP colapsa tipos, consolida colunas, ou remove dados (ex: merge de tipos de item):
→ documente explicitamente no arquivo DOWN, como comentário no topo:
```sql
-- ⚠️ ROLLBACK PARCIAL: este DOWN restaura a estrutura, mas dados colapsados
-- pelo UP não podem ser recuperados. Backup necessário antes do UP em produção.
```

### Gate mecânico
O `./scripts/ci-gates.sh` (Gate 2) verifica automaticamente que todo UP tem DOWN pareado.
Migration sem par = BLOQUEADOR no CI e no pre-push. Não bypassável.

### Migration fora de sprint
Se uma migration surge via Quick Fix ou Change Request:
→ **Quick Fix não cobre schema** — redirecione para Change Request Tipo C
→ O Change Request tem gate de migration próprio (ver `40-change-request.md`)
