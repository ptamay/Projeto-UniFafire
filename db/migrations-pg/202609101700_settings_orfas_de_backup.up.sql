-- 202609101700_settings_orfas_de_backup (UP) — TASK-112 · ADR-024
--
-- Saem de `settings` as duas linhas que a tela antiga gravava e que ninguém lê desde a
-- TASK-082 (ADR-013 tirou os controles porque eram inertes).
--
-- ## Por que apagar, e não reaproveitar
--
-- A agenda do backup voltou à tela (TASK-112) com chaves NOVAS — `backup_hora` e
-- `backup_vezes_por_dia`. O backup de produção de 2026-09-10 mostra por quê:
-- `backup_time` vale "02:00", resíduo da carga sintética da TASK-067. Reaproveitar a
-- chave teria mudado, em silêncio, o horário do backup de produção para um valor que
-- ninguém escolheu. Deixar a linha é deixar a mina para o próximo que tiver a mesma ideia.
--
-- Toca dados (DELETE): ensaiada sobre a cópia do backup antes de produção (§4.2) —
-- registro em `202609101700_settings_orfas_de_backup.ensaio.md`.

DELETE FROM settings WHERE key IN ('backup_time', 'backup_retention_count');
