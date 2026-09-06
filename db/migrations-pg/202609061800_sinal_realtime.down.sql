-- 202609061800_sinal_realtime (DOWN) — TASK-072 · Sprint 25 · Etapa 5
--
-- Escrito ANTES do UP (constitution §4.1).
--
-- Triggers antes da função, pelo mesmo motivo das migrations de `history`,
-- `app_logs` e `backup_runs`: a função é objeto de schema independente e
-- sobreviveria órfã ao DROP dos triggers, e um segundo UP falharia ao recriar
-- uma função de nome já existente.
--
-- Reverter aqui NÃO perde dado — o sinal não é persistido em lugar nenhum, é uma
-- mensagem efêmera. O que se perde é o sincronismo: as telas voltam a depender do
-- polling largo da TASK-073, com a defasagem que ele tiver. Nenhuma operação de
-- chave é afetada; o sinal sempre foi melhor-esforço.

DROP TRIGGER IF EXISTS keys_sinaliza_mudanca ON keys;
DROP TRIGGER IF EXISTS key_transactions_sinaliza_mudanca ON key_transactions;
DROP FUNCTION IF EXISTS public.sinalizar_mudanca_chaves();
