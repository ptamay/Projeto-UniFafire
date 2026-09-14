-- 202609141200_trilha_imutavel (UP) — TASK-124 · CR Tipo C · ADR-026
-- constitution §3.5, §4.4, §7.1 · REQ-005 · REQ-010 · REQ-014
--
-- A trilha de auditoria passa a ser imutável de verdade.
--
-- ## O que o banco fazia — medido em 2026-09-13
--
--     history      UPDATE/DELETE recusados (TASK-065)   TRUNCATE passa
--     app_logs     UPDATE/DELETE recusados (TASK-074)   TRUNCATE passa
--     backup_runs  UPDATE/DELETE recusados (TASK-078)   TRUNCATE passa
--     action_logs  UPDATE/DELETE PASSAM                 TRUNCATE passa
--     audit_logs   UPDATE/DELETE PASSAM                 TRUNCATE passa
--
-- A §3.5 chama de "imutável" a entrada que os endpoints destrutivos gravam, e os
-- comentários do logout e do reset de senha decidiram com base nisso — e `action_logs`,
-- que é a trilha da tela de Logs (REQ-010), aceitava ser reescrita. O que salvava a §3.5
-- era a cópia de todo `logAction` no `app_logs`; e nem ele estava a salvo de um TRUNCATE.
--
-- ## 1. Linha: action_logs e audit_logs ganham o gatilho que o history tem
--
-- Uma função só para as duas, com o nome da tabela na mensagem — as três antigas
-- (`history_imutavel`, `app_logs_imutavel`, `backup_runs_imutavel`) ficam como estão: não
-- há motivo para mexer em gatilho que funciona e está em produção.
--
-- Mesmo bypass (`set_config('app.maintenance_mode', 'on', true)`, local à transação) e
-- mesmo `search_path` fixo, pelos motivos registrados na TASK-065.
--
-- ## 2. Instrução: TRUNCATE recusado nas cinco
--
-- Gatilho de linha não dispara em TRUNCATE. `BEFORE TRUNCATE ... FOR EACH STATEMENT`
-- dispara — inclusive nas tabelas alcançadas por CASCADE: `TRUNCATE keys CASCADE` chega ao
-- `history` e é recusado do mesmo jeito.
--
-- Com o bypass: o Limpar Banco (REQ-014) e a restauração (TASK-115) já rodam no modo de
-- manutenção, e continuam funcionando sem mudança. A recarga offline (`db/load-pg.mjs
-- --truncate`) passou a ligá-lo. Um TRUNCATE esquecido em qualquer outro ponto do código
-- deixa de apagar a trilha inteira.
--
-- ## 3. REVOKE: defesa em profundidade, e hoje já é o estado
--
-- O DONO da tabela ignora REVOKE, e a aplicação conecta com papel amplo — quem barra é o
-- gatilho. Desde a `202609101600_api_de_dados_fechada`, `anon` e `authenticated` não têm
-- privilégio nenhum nas tabelas de `public`; o REVOKE abaixo não muda nada hoje, e está aqui
-- para a garantia ser legível na própria tabela e sobreviver a um GRANT futuro por engano.
--
-- ## O que NÃO muda
--
-- INSERT: a trilha cresce, nunca é reescrita. E o bypass continua nas mãos de quem tem a
-- credencial da aplicação — o gatilho protege contra defeito e contra acesso pela API, não
-- contra quem já controla o banco (ADR-026, consequências).

CREATE FUNCTION trilha_imutavel() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF current_setting('app.maintenance_mode', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    RAISE EXCEPTION '§3.5: % é imutável — % bloqueado (só o modo de manutenção do REQ-014 altera a trilha)',
        TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE FUNCTION trilha_sem_truncate() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF current_setting('app.maintenance_mode', true) = 'on' THEN
        RETURN NULL;
    END IF;

    RAISE EXCEPTION '§3.5: % é trilha de auditoria — TRUNCATE bloqueado (só o modo de manutenção do REQ-014 esvazia a trilha)',
        TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER action_logs_no_update
    BEFORE UPDATE ON action_logs
    FOR EACH ROW EXECUTE FUNCTION trilha_imutavel();

CREATE TRIGGER action_logs_no_delete
    BEFORE DELETE ON action_logs
    FOR EACH ROW EXECUTE FUNCTION trilha_imutavel();

CREATE TRIGGER audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION trilha_imutavel();

CREATE TRIGGER audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION trilha_imutavel();

CREATE TRIGGER history_no_truncate
    BEFORE TRUNCATE ON history
    FOR EACH STATEMENT EXECUTE FUNCTION trilha_sem_truncate();

CREATE TRIGGER action_logs_no_truncate
    BEFORE TRUNCATE ON action_logs
    FOR EACH STATEMENT EXECUTE FUNCTION trilha_sem_truncate();

CREATE TRIGGER audit_logs_no_truncate
    BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION trilha_sem_truncate();

CREATE TRIGGER app_logs_no_truncate
    BEFORE TRUNCATE ON app_logs
    FOR EACH STATEMENT EXECUTE FUNCTION trilha_sem_truncate();

CREATE TRIGGER backup_runs_no_truncate
    BEFORE TRUNCATE ON backup_runs
    FOR EACH STATEMENT EXECUTE FUNCTION trilha_sem_truncate();

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE history, action_logs, audit_logs, app_logs, backup_runs
    FROM PUBLIC, anon, authenticated;
