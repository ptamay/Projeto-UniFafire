-- 202609021800_normalize_history_timestamps (UP) — TASK-055 (Sprint 16)
-- history.timestamp tem duas formas gravadas: ISO com Z ('2026-07-06T20:33:14.439Z',
-- vindo de new Date().toISOString()) e a forma do CURRENT_TIMESTAMP do SQLite
-- ('2026-07-04 18:04:39'). As duas são UTC, mas o JavaScript interpreta a segunda
-- como hora LOCAL: essas linhas apareciam 3 horas adiantadas na tela, em silêncio.
-- A forma mista também impede comparação por faixa na coluna, porque o espaço
-- (0x20) ordena antes do 'T' (0x54) dentro do mesmo dia.
--
-- Esta migração só reescreve a REPRESENTAÇÃO — o instante gravado é o mesmo.
--
-- history tem triggers de imutabilidade (TASK-030/REQ-005) que bloqueiam UPDATE.
-- O bypass é o mesmo caminho autorizado do REQ-014: a flag em _maintenance_mode é
-- criada e removida dentro da própria migração, que o runner executa depois de
-- validar tudo numa cópia do banco.

CREATE TABLE IF NOT EXISTS _maintenance_mode (
    flag INTEGER PRIMARY KEY CHECK (flag = 1)
);

INSERT OR IGNORE INTO _maintenance_mode (flag) VALUES (1);

UPDATE history
   SET timestamp = substr(timestamp, 1, 10) || 'T' || substr(timestamp, 12, 8) || '.000Z'
 WHERE timestamp IS NOT NULL
   AND timestamp NOT LIKE '%Z'
   AND length(timestamp) = 19
   AND substr(timestamp, 11, 1) = ' ';

DELETE FROM _maintenance_mode;
