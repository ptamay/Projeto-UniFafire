-- 202609101000_tutorial_visto (DOWN) — TASK-098 · ADR-018
--
-- Escrito ANTES do UP (regra 20-migrations).
--
-- Reverter apaga o registro de quem já viu o tutorial. Consequência: todo mundo o
-- vê de novo no próximo acesso. Não é perda de dado de negócio nem de acesso — é
-- incômodo, e é reversível pelo próprio uso (basta fechar de novo).
--
-- Dito aqui porque um DOWN silencioso faria parecer que a reversão é neutra, e ela
-- tem um efeito visível para todos os usuários ao mesmo tempo.

ALTER TABLE users DROP COLUMN onboarding_visto_em;
