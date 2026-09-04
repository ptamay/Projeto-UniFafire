-- 202609031400_imutabilidade_historico (DOWN) — TASK-065 · Sprint 20
--
-- Escrito ANTES do UP (constitution §4.1).
--
-- ⚠️ Este DOWN REMOVE UM CONTROLE DE SEGURANÇA. Ele existe porque a regra de
-- migration pareada não abre exceção, não porque reverter isto seja rotina:
-- sem os triggers, `history` volta a aceitar UPDATE e DELETE diretos, e a
-- garantia de REQ-005 deixa de existir no nível do banco. Só rode como parte de
-- uma reversão completa da Etapa 3.
--
-- Restaura o estado exato anterior ao UP: sem triggers, sem função de guarda, e
-- com os privilégios de volta como o Postgres os deixa por padrão no Supabase.

DROP TRIGGER history_no_update ON history;
DROP TRIGGER history_no_delete ON history;

DROP FUNCTION history_imutavel();

-- Privilégios de volta ao padrão do template do Supabase, que concede às roles
-- da API de dados e depende de RLS para a restrição efetiva.
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO anon, authenticated;

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE key_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE history DISABLE ROW LEVEL SECURITY;
ALTER TABLE action_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_hits DISABLE ROW LEVEL SECURITY;
