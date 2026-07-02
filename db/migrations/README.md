# db/migrations — Migrações UP/DOWN pareadas (TASK-029 · REQ-009 · constitution §4)

## Regras
1. **Todo UP tem um DOWN pareado pelo mesmo prefixo de timestamp.** UP sem DOWN é
   BLOQUEADOR — o runner (`db/migrate.mjs`) se recusa a rodar.
2. **O DOWN restaura o estado EXATO anterior.** Se houver perda irreversível de dados
   (drop de coluna/tabela com dados), documente explicitamente no arquivo DOWN.
3. **Nomenclatura:** `YYYYMMDDHHMM_descricao.up.sql` / `YYYYMMDDHHMM_descricao.down.sql`.
4. **Teste em cópia:** o runner sempre executa a migração primeiro em uma cópia do banco
   com `PRAGMA integrity_check`; o banco real só é tocado se a cópia passar.
5. Aplicadas são registradas na tabela `_migrations`.

## Uso
```bash
node db/migrate.mjs status   # aplicadas × pendentes
node db/migrate.mjs up       # aplica pendentes (testa em cópia antes)
node db/migrate.mjs down 1   # reverte a última
```
O banco alvo é `keys.db` (ou `DB_PATH` no ambiente).

## Scripts legados
Os scripts em `scripts/` (`add_*.js`, `migrate_*.js`, `init-db.js` etc.) são **históricos**:
suas alterações estão consolidadas na baseline `202607021900_baseline`. Não devem ser
executados em produção. Novas mudanças de schema entram SOMENTE por este diretório.
