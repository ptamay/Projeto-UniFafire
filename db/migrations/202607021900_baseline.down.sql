-- 202607021900_baseline (DOWN)
-- ⚠️ PERDA IRREVERSÍVEL DE DADOS: este DOWN remove TODAS as tabelas do sistema.
-- Restaura o estado exato anterior à baseline (banco vazio). Só faz sentido em
-- ambiente de teste ou desastre total com restauração de backup na sequência.

DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS action_logs;
DROP TABLE IF EXISTS history;
DROP TABLE IF EXISTS key_transactions;
DROP TABLE IF EXISTS keys;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS users;
