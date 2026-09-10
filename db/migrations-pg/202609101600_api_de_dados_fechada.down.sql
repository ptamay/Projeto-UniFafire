-- 202609101600_api_de_dados_fechada (DOWN) — TASK-109 · ADR-023
--
-- Escrito ANTES do UP (constitution §4.1).
--
-- ⚠️ ESTE DOWN REABRE `public` À CHAVE PÚBLICA DO SUPABASE — a que está no bundle do
-- navegador. Ele existe porque migration sem DOWN é bloqueador, não porque reverter
-- isto seja rotina. Depois dele, toda tabela, sequência e função NOVA em `public`
-- volta a nascer concedida a `anon` e `authenticated`, e a proteção volta a depender
-- de cada migration lembrar o REVOKE.
--
-- Restaura o estado EXATO de antes do UP, lido em produção em 2026-09-10 e cobrado
-- pela ida e volta da suíte (ADR-022):
--   · as 11 sequências concedidas (ALL) a anon e authenticated;
--   · as 4 funções de trigger com EXECUTE para PUBLIC, anon e authenticated;
--   · o `rls_auto_enable` NÃO — ele já não tinha esses grants desde a TASK-065;
--   · nenhuma tabela: elas já não tinham grant a essas roles antes do UP;
--   · o default privilege da plataforma em `public`, e o default global de EXECUTE
--     para PUBLIC em funções.

ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.history_imutavel(),
    public.app_logs_imutavel(),
    public.backup_runs_imutavel(),
    public.sinalizar_mudanca_chaves()
TO PUBLIC, anon, authenticated;
