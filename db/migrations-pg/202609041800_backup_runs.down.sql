-- 202609041800_backup_runs (DOWN) — TASK-078 · Sprint 23 · Etapa 7b
--
-- Escrito ANTES do UP (constitution §4.1).
--
-- Triggers e função antes da tabela, pelo mesmo motivo da migration de
-- `app_logs`: DROP TABLE derruba os triggers em cascata, mas a função é objeto
-- de schema independente e sobreviveria órfã — e um segundo UP falharia ao
-- recriar uma função de nome já existente.
--
-- Reverter aqui apaga o histórico de execuções de backup. Não há dado de
-- negócio nisso, mas há a evidência de que os backups rodaram: depois de um
-- período em produção, esta reversão custa a capacidade de responder "quando foi
-- o último backup bom?". Use antes do primeiro job agendado, não depois.

DROP TRIGGER IF EXISTS backup_runs_no_update ON backup_runs;
DROP TRIGGER IF EXISTS backup_runs_no_delete ON backup_runs;
DROP FUNCTION IF EXISTS backup_runs_imutavel();
DROP TABLE IF EXISTS backup_runs;
