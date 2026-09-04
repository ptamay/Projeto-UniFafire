-- 202609031300_indices (DOWN) — TASK-064 · Sprint 20 · Etapa 3 do ADR-012
--
-- Escrito ANTES do UP (constitution §4.1). Sem perda de dados: índice é
-- estrutura derivada, e derrubá-lo devolve exatamente o estado anterior.
--
-- Só os índices desta migration. Os índices implícitos de PRIMARY KEY e UNIQUE
-- pertencem às constraints declaradas na baseline e são removidos com elas,
-- nunca aqui.

DROP INDEX idx_history_timestamp;
DROP INDEX idx_history_key_id;
DROP INDEX idx_history_user_id;
DROP INDEX idx_action_logs_timestamp;
DROP INDEX idx_key_transactions_key_id_status;
DROP INDEX idx_key_transactions_user_id;
DROP INDEX idx_rate_limit_hits_lookup;
