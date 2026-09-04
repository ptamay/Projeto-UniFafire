-- 202609021700_rate_limit_hits (UP) — TASK-054 (Sprint 16)
-- Estado do rate limit sai da memória do processo e passa a viver no banco, o
-- único ponto compartilhado entre instâncias. Sob PM2 (instância única) o Map em
-- memória funcionava; em execução serverless cada cold start zerava o contador.
-- hit_at é epoch em milissegundos: comparável por faixa em SQLite e Postgres,
-- sem depender de formato de data ou função de dialeto.

CREATE TABLE IF NOT EXISTS rate_limit_hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    identifier TEXT NOT NULL,
    hit_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_lookup
    ON rate_limit_hits (scope, identifier, hit_at);
