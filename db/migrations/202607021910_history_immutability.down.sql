-- 202607021910_history_immutability (DOWN)
-- Restaura o estado exato anterior: remove os triggers de imutabilidade e a
-- tabela de modo manutenção. Sem perda de dados (history não é tocada).

DROP TRIGGER IF EXISTS history_no_update;
DROP TRIGGER IF EXISTS history_no_delete;
DROP TABLE IF EXISTS _maintenance_mode;
