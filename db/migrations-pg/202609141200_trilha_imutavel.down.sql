-- 202609141200_trilha_imutavel (DOWN) — TASK-124 · ADR-026
--
-- Volta ao estado medido em 2026-09-13: `action_logs` e `audit_logs` aceitando UPDATE e
-- DELETE, e TRUNCATE passando nas cinco tabelas da trilha. Os gatilhos de linha de
-- `history`, `app_logs` e `backup_runs` são das migrations deles e ficam.
--
-- Nenhum GRANT de volta: o REVOKE do UP não tirou privilégio de ninguém. Desde a
-- `202609101600_api_de_dados_fechada`, `anon` e `authenticated` não têm nada nas tabelas de
-- `public`, e `PUBLIC` nunca teve. Devolver aqui seria abrir o que nunca esteve aberto — e a
-- ida e volta (TASK-106) reprovaria pelo retrato de privilégios.

DROP TRIGGER history_no_truncate ON history;
DROP TRIGGER action_logs_no_truncate ON action_logs;
DROP TRIGGER audit_logs_no_truncate ON audit_logs;
DROP TRIGGER app_logs_no_truncate ON app_logs;
DROP TRIGGER backup_runs_no_truncate ON backup_runs;

DROP TRIGGER action_logs_no_update ON action_logs;
DROP TRIGGER action_logs_no_delete ON action_logs;
DROP TRIGGER audit_logs_no_update ON audit_logs;
DROP TRIGGER audit_logs_no_delete ON audit_logs;

DROP FUNCTION trilha_sem_truncate();
DROP FUNCTION trilha_imutavel();
