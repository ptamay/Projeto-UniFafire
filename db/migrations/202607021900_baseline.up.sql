-- 202607021900_baseline (UP)
-- Baseline do schema de produção (keys.db) extraído em 2026-07-02 — TASK-029.
-- Usa IF NOT EXISTS: seguro executar sobre um banco legado já existente
-- (a migração é então apenas registrada em _migrations, sem efeito).
-- Nota: as migrações históricas em scripts/ (add_*, migrate_*) estão consolidadas aqui
-- e não devem mais ser executadas em produção.

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'USER',
    active BOOLEAN DEFAULT 1,
    full_name TEXT,
    matricula TEXT,
    phone TEXT,
    requires_password_change BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT,
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    room TEXT,
    status TEXT DEFAULT 'available',
    employee_id INTEGER,
    active INTEGER DEFAULT 1,
    user_id INTEGER REFERENCES users(id),
    FOREIGN KEY(employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS key_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    porteiro_id INTEGER,
    porteiro_confirmed_at DATETIME,
    user_confirmed_at DATETIME,
    status TEXT DEFAULT 'pending',
    initiated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY(key_id) REFERENCES keys(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(porteiro_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    key_id INTEGER,
    action TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id),
    username TEXT,
    transaction_id INTEGER REFERENCES key_transactions(id),
    FOREIGN KEY(key_id) REFERENCES keys(id)
);

CREATE TABLE IF NOT EXISTS action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    target_user_id INTEGER,
    action TEXT,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(actor_id) REFERENCES users(id),
    FOREIGN KEY(target_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    ip TEXT,
    success INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL
);
