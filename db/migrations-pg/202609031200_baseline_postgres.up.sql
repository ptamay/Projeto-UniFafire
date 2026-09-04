-- 202609031200_baseline_postgres (UP) — TASK-063 · Sprint 20 · Etapa 3 do ADR-012
--
-- Equivalente Postgres da baseline SQLite (202607021900_baseline) mais as três
-- migrations incrementais que vieram depois: justification (202607041500),
-- rate_limit_hits (202609021700) e a normalização de timestamps (202609021800,
-- que só reescreveu representação e por isso não tem contrapartida de schema).
--
-- O DOWN pareado foi escrito antes deste arquivo (constitution §4.1).
--
-- Esta migration NÃO é aplicada ao keys.db. As migrations SQLite continuam em
-- db/migrations/ e o keys.db segue sendo a fonte vigente até a Etapa 7.
--
-- Conversões de dialeto aplicadas aqui (as de CONSULTA, que tocam código de
-- aplicação, estão em docs/migracao-dialeto-sql.md e são da Sprint 21):
--
--   INTEGER PRIMARY KEY AUTOINCREMENT → integer GENERATED ALWAYS AS IDENTITY
--     O rowid do SQLite não existe no Postgres. IDENTITY é o padrão SQL, e ao
--     contrário de serial não deixa a sequência órfã de dono.
--   BOOLEAN/INTEGER DEFAULT 1        → boolean DEFAULT true
--     O SQLite não tem boolean: users.active, users.requires_password_change,
--     keys.active e login_attempts.success guardam 0/1. No Postgres viram o tipo
--     de verdade, e comparações com 0/1 passam a ser erro em vez de silêncio.
--   DATETIME DEFAULT CURRENT_TIMESTAMP → timestamptz DEFAULT now()
--     CURRENT_TIMESTAMP no SQLite grava texto 'YYYY-MM-DD HH:MM:SS' sem fuso —
--     a raiz do defeito corrigido na TASK-055, em que o JavaScript lia o valor
--     como hora local e exibia 3h adiantado. timestamptz elimina a classe.
--   rate_limit_hits.hit_at           → bigint (epoch em ms), NÃO timestamptz
--     Escolha deliberada da TASK-054, mantida: comparável por faixa nos dois
--     dialetos, sem depender de função de data.
--
-- Sem IF NOT EXISTS: a baseline SQLite precisava dele porque rodava sobre um
-- banco legado já existente; aqui o schema nasce vazio, e IF NOT EXISTS só
-- esconderia um UP aplicado duas vezes por engano.
--
-- Ausência de `employees` e das colunas `employee_id`: legado descartado pela
-- decisão da TASK-066 (0 linhas em employees, employee_id NULL em 5/5 keys e
-- 30/30 history no backup de produção de 2026-07-06). Nascer sem o legado é a
-- consolidação; criá-lo aqui só para derrubá-lo na task seguinte seria teatro.
--
-- Índices ficam para a TASK-064, incluindo a preservação do
-- idx_rate_limit_hits_lookup que veio com a tabela no SQLite.

CREATE TABLE users (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text UNIQUE,
    password_hash text,
    role text DEFAULT 'USER',
    active boolean DEFAULT true,
    full_name text,
    matricula text,
    phone text,
    requires_password_change boolean DEFAULT true
);

CREATE TABLE keys (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    room text,
    status text DEFAULT 'available',
    active boolean DEFAULT true,
    user_id integer REFERENCES users(id)
);

CREATE TABLE key_transactions (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key_id integer NOT NULL REFERENCES keys(id),
    user_id integer NOT NULL REFERENCES users(id),
    action text NOT NULL,
    porteiro_id integer REFERENCES users(id),
    porteiro_confirmed_at timestamptz,
    user_confirmed_at timestamptz,
    status text DEFAULT 'pending',
    initiated_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    justification text
);

CREATE TABLE history (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key_id integer REFERENCES keys(id),
    action text,
    timestamp timestamptz DEFAULT now(),
    user_id integer REFERENCES users(id),
    username text,
    transaction_id integer REFERENCES key_transactions(id)
);

CREATE TABLE action_logs (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id integer REFERENCES users(id),
    username text,
    action text NOT NULL,
    target text,
    details text,
    timestamp timestamptz DEFAULT now(),
    ip_address text
);

CREATE TABLE audit_logs (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id integer REFERENCES users(id),
    target_user_id integer REFERENCES users(id),
    action text,
    details text,
    timestamp timestamptz DEFAULT now()
);

CREATE TABLE login_attempts (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text,
    ip text,
    success boolean,
    timestamp timestamptz DEFAULT now()
);

CREATE TABLE settings (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key text UNIQUE NOT NULL,
    value text NOT NULL
);

CREATE TABLE rate_limit_hits (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scope text NOT NULL,
    identifier text NOT NULL,
    hit_at bigint NOT NULL
);
