-- 202609101100_registro_de_migracoes (UP) — TASK-101 · ADR-021
-- constitution §4.1
--
-- O registro do que o runner aplicou.
--
-- ## Por que uma tabela própria, e não o ledger do Supabase
--
-- O ledger (`supabase_migrations.schema_migrations`) só recebe entrada quando quem
-- aplica usa a CLI do Supabase — aplicar pelo editor SQL não escreve nada, e nada
-- avisa. Em três dias ele acumulou cinco divergências, por mãos que sabiam o que
-- estavam fazendo. Disputar com ele é perder.
--
-- Esta tabela só recebe linha se a migration foi aplicada PELO RUNNER, e na MESMA
-- transação que a migration. "Aplicada" e "registrada" não podem divergir, porque
-- são o mesmo commit.
--
-- ## As colunas
--
-- `checksum` é o SHA-256 do arquivo UP no momento da aplicação. Editar uma
-- migration já aplicada é o jeito mais silencioso de repositório e banco
-- divergirem; com o hash, `conferir` aponta.
--
-- `modo` separa o que o runner EXECUTOU do que ele apenas MARCOU como já presente
-- (a adoção da TASK-102). A distinção importa numa auditoria: "adotada" quer dizer
-- "estava no banco antes de haver registro, e ninguém a rodou por aqui".
--
-- ## Sem dependência de nada
--
-- Esta migration só cria a própria tabela. É o que permite ao runner aplicá-la
-- PRIMEIRO numa base vazia, fora da ordem do prefixo: a primeira migration precisa
-- de uma tabela para ser registrada, e esta é a tabela.

CREATE TABLE migracoes_aplicadas (
    nome        text        PRIMARY KEY,
    checksum    text        NOT NULL,
    modo        text        NOT NULL CHECK (modo IN ('aplicada', 'adotada')),
    aplicada_em timestamptz NOT NULL DEFAULT now()
);

-- Mesma postura de toda tabela do projeto (TASK-065): RLS ligado, nenhuma política,
-- nada para `anon`/`authenticated`. O registro é lido pelo runner com a credencial
-- de migração — nunca pelo navegador.
ALTER TABLE migracoes_aplicadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE migracoes_aplicadas FROM anon, authenticated;
