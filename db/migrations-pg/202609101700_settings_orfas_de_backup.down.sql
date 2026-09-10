-- 202609101700_settings_orfas_de_backup (DOWN) — TASK-112 · ADR-024
--
-- Escrito ANTES do UP (constitution §4.1).
--
-- Devolve as duas linhas com os valores que produção tinha, lidos do backup verificado
-- de 2026-09-10: `backup_time = 02:00` e `backup_retention_count = 7`. Nenhum código as
-- lê — voltam como estavam: órfãs.
--
-- ⚠️ ROLLBACK PARCIAL no `id`: as linhas voltam com id NOVO (a sequência não recua).
-- Nada referencia `settings.id`, e a chave de negócio é `key`.

INSERT INTO settings (key, value) VALUES
    ('backup_time', '02:00'),
    ('backup_retention_count', '7')
ON CONFLICT (key) DO NOTHING;
