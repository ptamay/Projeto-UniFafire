-- 202609031400_imutabilidade_historico (UP) — TASK-065 · Sprint 20 · Etapa 3
-- constitution §4.4 · REQ-005 · REQ-014 · §3.2
--
-- Duas metades do mesmo assunto: quem pode escrever em `history`.
--
-- ## 1. Imutabilidade
--
-- No SQLite (202607021910) a guarda são dois triggers com RAISE(ABORT)
-- condicionados a uma tabela-flag `_maintenance_mode`, inserida e removida na
-- mesma transação por src/lib/db-maintenance.ts. Funciona, mas a garantia de
-- escopo depende da disciplina do chamador: nada no banco impede que a flag
-- fique gravada se alguém a inserir fora de transação.
--
-- No Postgres o bypass é `set_config('app.maintenance_mode', 'on', true)`. O
-- terceiro argumento `true` é is_local: o ajuste morre no COMMIT ou no ROLLBACK,
-- por construção do próprio Postgres. Não há estado a limpar, e por isso não há
-- estado que possa vazar da transação. A tabela-flag deixa de existir.
--
-- O segundo argumento de current_setting é `true` (missing_ok): sem ele, um
-- ajuste nunca definido LANÇA erro em vez de devolver NULL — e a guarda quebraria
-- em toda escrita normal, que é justamente o caso em que o ajuste não existe.
--
-- INSERT não é tocado: a trilha cresce, nunca é reescrita.
--
-- ## 2. Superfície de escrita
--
-- Até agora o banco esteve numa intranet; a partir do ADR-012 ele é alcançável
-- pela internet. O Supabase publica as tabelas de `public` pela API de dados, e a
-- autorização deste sistema é sessão própria verificada no servidor (§3.2) —
-- tabela alcançável pela chave anônima passaria ao largo dela inteira.
--
-- RLS é declarada aqui explicitamente, e não herdada do event trigger
-- `ensure_rls` que o Supabase instala: aquilo é configuração de projeto, que pode
-- ser desligada sem que nada neste repositório mude. O que está na migration é
-- verificável no código.
--
-- Sem CREATE POLICY, de propósito: RLS ligada e sem política nega tudo a quem não
-- é dono da tabela. Uma política abriria um segundo caminho de autorização, em
-- paralelo à sessão da aplicação — dois lugares para acertar em vez de um.
--
-- ⚠️ REVOKE aqui é defesa em profundidade, não a garantia principal: o DONO da
-- tabela ignora REVOKE e RLS. Enquanto a aplicação conectar com papel amplo, quem
-- de fato barra UPDATE/DELETE em `history` é o TRIGGER, que vale para todos,
-- inclusive o dono. O papel de aplicação com menor privilégio é a **TASK-077**
-- (Sprint 24), e só lá o REVOKE passa a valer para a própria aplicação.

-- search_path fixo: sem ele, a função resolve nomes pela variável de sessão de
-- quem dispara o trigger — o controle que guarda a trilha dependendo de estado
-- que o chamador controla. Só há chamadas a construções internas, então
-- pg_catalog basta. É o mesmo cuidado que a rls_auto_enable do Supabase toma.
CREATE FUNCTION history_imutavel() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF current_setting('app.maintenance_mode', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'REQ-005: o histórico é imutável — UPDATE bloqueado';
    ELSE
        RAISE EXCEPTION 'REQ-005: o histórico é imutável — DELETE bloqueado (use o fluxo ADMIN do REQ-014)';
    END IF;
END;
$$;

CREATE TRIGGER history_no_update
    BEFORE UPDATE ON history
    FOR EACH ROW EXECUTE FUNCTION history_imutavel();

CREATE TRIGGER history_no_delete
    BEFORE DELETE ON history
    FOR EACH ROW EXECUTE FUNCTION history_imutavel();

REVOKE UPDATE, DELETE ON TABLE history FROM PUBLIC, anon, authenticated;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Achado do get_advisors, não introduzido por esta migração: rls_auto_enable é
-- a função do event trigger do próprio Supabase, SECURITY DEFINER, e está
-- publicada em /rest/v1/rpc/ para anon e authenticated. Chamá-la fora de um
-- event trigger erra de qualquer forma, mas função SECURITY DEFINER exposta a
-- anônimo não é superfície que se deixa aberta por ser difícil de explorar.
-- Revogar EXECUTE não afeta o event trigger, que não passa por este privilégio.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
