-- 202607021910_history_immutability (UP) — TASK-030 · REQ-005
-- Histórico imutável no nível do banco: UPDATE/DELETE diretos são bloqueados por
-- trigger. O único caminho autorizado é o modo manutenção (fluxo ADMIN do REQ-014):
-- uma linha em _maintenance_mode habilita a operação e é removida na mesma
-- transação (ver src/lib/db-maintenance.ts). Nunca desabilite os triggers.

CREATE TABLE IF NOT EXISTS _maintenance_mode (
    flag INTEGER PRIMARY KEY CHECK (flag = 1)
);

CREATE TRIGGER IF NOT EXISTS history_no_update
BEFORE UPDATE ON history
FOR EACH ROW
WHEN (SELECT COUNT(*) FROM _maintenance_mode) = 0
BEGIN
    SELECT RAISE(ABORT, 'REQ-005: o histórico é imutável — UPDATE bloqueado');
END;

CREATE TRIGGER IF NOT EXISTS history_no_delete
BEFORE DELETE ON history
FOR EACH ROW
WHEN (SELECT COUNT(*) FROM _maintenance_mode) = 0
BEGIN
    SELECT RAISE(ABORT, 'REQ-005: o histórico é imutável — DELETE bloqueado (use o fluxo ADMIN do REQ-014)');
END;
