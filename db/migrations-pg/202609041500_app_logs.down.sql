-- 202609041500_app_logs (DOWN) — TASK-074 · Sprint 22 · Etapa 7a
--
-- Escrito ANTES do UP (constitution §4.1). Reverter aqui é honesto: a tabela
-- nasce nesta migração, então desfazê-la devolve o banco ao estado anterior sem
-- perda de dado pré-existente — o que se perde é a trilha acumulada DEPOIS dela,
-- e é por isso que este DOWN só deve ser usado antes de a aplicação começar a
-- gravar, nunca como rotina.
--
-- Ordem: triggers e função antes da tabela. DROP TABLE derrubaria os triggers em
-- cascata, mas a função é objeto de schema independente e sobreviveria órfã —
-- e um segundo UP falharia em CREATE FUNCTION com nome já existente.

DROP TRIGGER IF EXISTS app_logs_no_update ON app_logs;
DROP TRIGGER IF EXISTS app_logs_no_delete ON app_logs;
DROP FUNCTION IF EXISTS app_logs_imutavel();
DROP TABLE IF EXISTS app_logs;
