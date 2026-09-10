-- 202609101600_api_de_dados_fechada (UP) — TASK-109 · ADR-023
--
-- A chave pública do Supabase (`anon`, no bundle do navegador, usada só pelo
-- Realtime) e `authenticated` (o projeto não usa Supabase Auth) deixam de alcançar
-- qualquer coisa em `public` — e o que for criado depois nasce fechado.
--
-- ## O que havia, lido em produção em 2026-09-10
--
-- Nenhum privilégio nas 12 tabelas (as REVOKEs das migrations anteriores funcionam), mas
-- SELECT/UPDATE/USAGE nas 11 sequências e EXECUTE nas 4 funções de trigger. Sobra, não
-- falha explorável. O risco era o do dia seguinte: no Supabase, objeto novo em `public`
-- NASCE concedido a essas roles, e as tabelas só estavam fechadas porque cada migration
-- lembrou o REVOKE.
--
-- ## Por que PUBLIC também, nas funções
--
-- O Postgres dá EXECUTE a PUBLIC em toda função nova, e `anon` herda por aí: revogar só
-- de `anon` não fecharia nada. O default de PUBLIC só se revoga pela forma GLOBAL do
-- ALTER DEFAULT PRIVILEGES — a forma IN SCHEMA só acrescenta. Trigger não depende do
-- EXECUTE de quem faz o INSERT/UPDATE, então os guardas de imutabilidade e o sinal do
-- Realtime seguem disparando.
--
-- ## O que NÃO muda
--
-- `service_role` (decisão do usuário, ADR-023): a chave é secreta, ignora RLS por
-- desenho, e a plataforma pode usá-la. E o default que a plataforma mantém para objetos
-- criados por `supabase_admin` — este ALTER DEFAULT vale para a role que aplica a
-- migration, que é a que cria os objetos deste projeto.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
