-- 202609031300_indices (UP) — TASK-064 · Sprint 20 · Etapa 3 do ADR-012
--
-- O schema do keys.db não declara um único índice fora do
-- idx_rate_limit_hits_lookup, que veio com a tabela na TASK-054. Com 5 chaves,
-- ~130 linhas de histórico e o banco no mesmo processo, a varredura completa
-- respondia em ~1 ms e o custo era invisível. Sob rede, cada varredura vira
-- ida-e-volta.
--
-- Os índices de data só são úteis porque a TASK-055 tornou os filtros sargáveis:
-- antes a consulta aplicava função sobre a coluna (strftime), o que descarta
-- qualquer índice; hoje compara faixa [início, fim).
--
-- DESC em history.timestamp e action_logs.timestamp: as duas telas listam do
-- mais recente para o mais antigo e paginam. Um índice ASC atende a faixa, mas
-- deixa a ordenação para ser refeita a cada página.

CREATE INDEX idx_history_timestamp ON history (timestamp DESC);
CREATE INDEX idx_history_key_id ON history (key_id);
CREATE INDEX idx_history_user_id ON history (user_id);

CREATE INDEX idx_action_logs_timestamp ON action_logs (timestamp DESC);

-- (key_id, status) nesta ordem: a consulta de chaves filtra por chave e restringe
-- o status a ('pending', 'porteiro_confirmed') — key_id é a coluna seletiva.
CREATE INDEX idx_key_transactions_key_id_status ON key_transactions (key_id, status);
CREATE INDEX idx_key_transactions_user_id ON key_transactions (user_id);

-- Preservado da TASK-054: no SQLite ele nasceu junto da tabela, na mesma
-- migration. Aqui a tabela veio na baseline e o índice vem nesta — sem esta
-- linha ele se perderia calado na virada de stack.
CREATE INDEX idx_rate_limit_hits_lookup ON rate_limit_hits (scope, identifier, hit_at);
