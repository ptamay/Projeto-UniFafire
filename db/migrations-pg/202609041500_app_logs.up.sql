-- 202609041500_app_logs (UP) — TASK-074 · Sprint 22 · Etapa 7a
-- constitution §7 · REQ-031 critério (d) · REQ-014
--
-- O destino do log estruturado deixa de ser arquivo e passa a ser tabela.
--
-- ## Por que isto é pré-requisito do deploy, e não melhoria
--
-- `structured-logger.ts` gravava em `logs/` com appendFileSync. No Vercel o
-- filesystem é efêmero e somente-leitura: a escrita falha, cai no catch que já
-- existia, degrada para console e a aplicação segue saudável. A trilha some sem
-- que nada avise. A §7 já dizia que arquivo em `logs/` não serve à hospedagem
-- serverless; o critério (d) do REQ-031 nomeia o log estruturado ao lado de
-- `history` e `action_logs`.
--
-- ## Imutabilidade: trigger, pelo mesmo motivo da TASK-065
--
-- A §7 pede REVOKE UPDATE, DELETE. REVOKE é necessário mas não suficiente: o
-- DONO da tabela o ignora, e a aplicação conecta hoje com papel amplo. Quem de
-- fato barra é o TRIGGER, que vale para todos, inclusive o dono. O REVOKE fica
-- como defesa em profundidade e passa a valer também para a aplicação quando
-- existir um papel de menor privilégio — o que ainda NÃO é nenhuma task deste
-- roadmap (ver nota ao final).
--
-- ## O bypass é o mesmo do `history`, e de propósito
--
-- Poderia não haver bypass nenhum, o que soaria mais forte. Seria pior por dois
-- motivos. Primeiro, incoerência: `history` é a trilha mais protegida do sistema
-- (REQ-005) e tem bypass autorizado para o fluxo ADMIN do REQ-014 — dar a
-- `app_logs` uma garantia MAIS rígida que a do histórico inverteria a hierarquia
-- sem que ninguém tivesse decidido isso. Segundo, retenção: sem NENHUM caminho
-- de remoção, a tabela cresce para sempre. Com ~19 usuários e um registro de
-- timing por rota crítica, a ordem de grandeza é de centenas de MB por ano,
-- contra os 500 MB do plano gratuito. Uma trilha que enche o banco e derruba o
-- sistema não protege ninguém.
--
-- O bypass NÃO afrouxa a §7: "nunca entra em rotina de limpeza" é sobre o
-- REQ-014, e `app_logs` está fora de `tablesToClear` (verificado em teste). O
-- que este bypass permite é uma política de retenção deliberada e auditável, a
-- ser desenhada na Etapa 7b — não uma limpeza acidental.

CREATE TABLE app_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    level text NOT NULL,
    message text NOT NULL,
    -- jsonb, e não text: o contexto é consultável (`context->>'route'`) sem
    -- reparsear a linha inteira, e o Postgres valida a estrutura na escrita.
    context jsonb
);

-- Leitura típica é "o que aconteceu agora" e "o que deu errado".
CREATE INDEX idx_app_logs_ts ON app_logs (ts DESC);
CREATE INDEX idx_app_logs_level_ts ON app_logs (level, ts DESC);

-- search_path fixo: sem ele a função resolve nomes pela variável de sessão de
-- quem dispara o trigger — o controle que guarda a trilha dependendo de estado
-- que o chamador controla. Mesmo cuidado da TASK-065.
CREATE FUNCTION app_logs_imutavel() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF current_setting('app.maintenance_mode', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION '§7: app_logs é imutável — UPDATE bloqueado';
    ELSE
        RAISE EXCEPTION '§7: app_logs é imutável — DELETE bloqueado (retenção deliberada usa o bypass de manutenção)';
    END IF;
END;
$$;

CREATE TRIGGER app_logs_no_update
    BEFORE UPDATE ON app_logs
    FOR EACH ROW EXECUTE FUNCTION app_logs_imutavel();

CREATE TRIGGER app_logs_no_delete
    BEFORE DELETE ON app_logs
    FOR EACH ROW EXECUTE FUNCTION app_logs_imutavel();

REVOKE UPDATE, DELETE ON TABLE app_logs FROM PUBLIC, anon, authenticated;

-- RLS ligada e sem política nega tudo a quem não é dono (mesma postura da
-- TASK-065): a autorização deste sistema é a sessão verificada no servidor
-- (§3.2), não o JWT do Supabase. Tabela alcançável pela chave anônima passaria
-- ao largo dela inteira — e esta guarda registros operacionais.
ALTER TABLE app_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_logs FROM anon, authenticated;

-- NOTA para a Etapa 7b: não existe task para criar um papel de aplicação com
-- MENOR PRIVILÉGIO. Enquanto não existir, todo REVOKE desta migração e da
-- TASK-065 é defesa em profundidade contra `anon`/`authenticated`, e não contra
-- a própria aplicação. O comentário da TASK-065 atribuiu esse trabalho à
-- TASK-077, mas a TASK-077 do plan.md é a autorização no `proxy.ts` — coisa
-- diferente. A lacuna está registrada no plan.md.
