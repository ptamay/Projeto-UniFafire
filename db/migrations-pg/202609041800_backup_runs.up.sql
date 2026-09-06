-- 202609041800_backup_runs (UP) — TASK-078 · Sprint 23 · Etapa 7b
-- constitution §4.3 (corrigida no CR Tipo D de 2026-09-04) · REQ-031 critério (c)
--
-- O registro de cada execução de backup — a evidência de que o RPO de 24 h está
-- sendo cumprido, e a fonte da métrica de confiabilidade (TASK-075).
--
-- ## Por que a falha precisa de linha própria
--
-- A tentação é gravar só o sucesso: a tabela fica limpa e a métrica fica
-- bonita. Seria a métrica errada. Com apenas sucessos registrados, "100% de
-- sucesso" e "nunca rodou" produzem a MESMA leitura, e a única diferença entre
-- as duas — que uma é segura e a outra é um desastre esperando — desaparece
-- exatamente na tela feita para mostrá-la.
--
-- Por isso `succeeded` é uma coluna, e não um filtro implícito na consulta.
--
-- ## Imutável, como o resto da trilha
--
-- Mesma postura de `history` (TASK-065) e `app_logs` (TASK-074), e pelo mesmo
-- motivo: um registro de backup que pode ser reescrito não é evidência de nada.
-- A garantia é o TRIGGER, não o REVOKE — o dono da tabela ignora REVOKE, e a
-- aplicação ainda conecta com papel amplo.
--
-- O bypass é o mesmo `set_config` transacional das outras duas, para que uma
-- política de retenção futura tenha caminho autorizado em vez de precisar
-- desligar o trigger.

CREATE TABLE backup_runs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ran_at timestamptz NOT NULL DEFAULT now(),
    succeeded boolean NOT NULL,
    -- bigint: um dump comprimido passa de 2 GB sem drama, e integer estouraria
    -- em silêncio.
    size_bytes bigint,
    -- NULL quando deu certo. Quando não deu, a mensagem JÁ CHEGA AQUI
    -- higienizada por `db/backup-run.mjs` — erro de `pg_dump` ecoa a string de
    -- conexão inteira, com senha, e esta tabela é lida pela tela de
    -- configurações (§6.1).
    error text,
    -- Onde o dump foi parar. Sem isto, "o backup rodou" não responde "e está
    -- onde?", que é a pergunta de quem precisa restaurar.
    destination text
);

-- A leitura da métrica é sempre "as últimas N execuções" ou "os últimos N dias".
CREATE INDEX idx_backup_runs_ran_at ON backup_runs (ran_at DESC);

CREATE FUNCTION backup_runs_imutavel() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF current_setting('app.maintenance_mode', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION '§4.3: backup_runs é imutável — UPDATE bloqueado';
    ELSE
        RAISE EXCEPTION '§4.3: backup_runs é imutável — DELETE bloqueado (retenção deliberada usa o bypass de manutenção)';
    END IF;
END;
$$;

CREATE TRIGGER backup_runs_no_update
    BEFORE UPDATE ON backup_runs
    FOR EACH ROW EXECUTE FUNCTION backup_runs_imutavel();

CREATE TRIGGER backup_runs_no_delete
    BEFORE DELETE ON backup_runs
    FOR EACH ROW EXECUTE FUNCTION backup_runs_imutavel();

REVOKE UPDATE, DELETE ON TABLE backup_runs FROM PUBLIC, anon, authenticated;

ALTER TABLE backup_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE backup_runs FROM anon, authenticated;
