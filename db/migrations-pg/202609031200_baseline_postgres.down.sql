-- 202609031200_baseline_postgres (DOWN) — TASK-063 · Sprint 20 · Etapa 3 do ADR-012
--
-- Escrito ANTES do UP (constitution §4.1). Devolve o schema `public` ao estado
-- vazio em que o projeto Supabase foi criado.
--
-- Sem perda irreversível de dados: nesta altura da migração o Postgres é cópia,
-- e o `keys.db` segue sendo a fonte vigente (plano de reversão do ADR-012, item 2).
-- Isso deixa de valer a partir da primeira escrita de produção no Postgres —
-- ponto de não-retorno declarado no ADR. A partir de lá, este DOWN destrói dados
-- que não existem em nenhum outro lugar.
--
-- Ordem inversa às dependências, sem CASCADE de propósito: se algo criado fora
-- desta migration passar a depender destas tabelas, o DROP falha alto em vez de
-- arrastar o dependente junto em silêncio.

DROP TABLE history;
DROP TABLE key_transactions;
DROP TABLE action_logs;
DROP TABLE audit_logs;
DROP TABLE keys;
DROP TABLE users;
DROP TABLE login_attempts;
DROP TABLE settings;
DROP TABLE rate_limit_hits;
