-- 202609021700_rate_limit_hits (DOWN) — TASK-054
-- Dados efêmeros (janela de 1 minuto): descartar a tabela não perde auditoria,
-- que permanece integral em action_logs (REQ-010).

DROP INDEX IF EXISTS idx_rate_limit_hits_lookup;
DROP TABLE IF EXISTS rate_limit_hits;
