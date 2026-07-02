const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = process.env.MOCK_DB_IN_MEMORY === 'true'
  ? ':memory:'
  : path.resolve(process.cwd(), process.env.DB_PATH || 'keys.db');
const db = new Database(dbPath);

console.log('Initializing database at:', dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'USER',
    active INTEGER DEFAULT 1
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
    status TEXT DEFAULT 'available', -- 'available', 'in_use'
    employee_id INTEGER,
    user_id INTEGER,
    active INTEGER DEFAULT 1,
    FOREIGN KEY(employee_id) REFERENCES employees(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    user_id INTEGER,
    username TEXT,
    key_id INTEGER,
    action TEXT, -- 'withdraw', 'return'
    transaction_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(key_id) REFERENCES keys(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    target_user_id INTEGER,
    action TEXT, -- 'PROMOTE', 'DEMOTE'
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(actor_id) REFERENCES users(id),
    FOREIGN KEY(target_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT, -- Captured at time of action
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    ip_address TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    ip TEXT,
    success INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS key_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    porteiro_id INTEGER,
    user_confirmed_at DATETIME,
    porteiro_confirmed_at DATETIME,
    cancelled_at DATETIME,
    completed_at DATETIME,
    initiated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create default admin user if not exists
const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
const user = stmt.get('admin');

if (!user) {
  const hash = bcrypt.hashSync('admin', 10);
  const insert = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
  insert.run('admin', hash, 'ADMIN');
  console.log('Default admin user created (user: admin, pass: admin, role: ADMIN)');
} else {
  console.log('Admin user already exists.');
}

console.log('Database initialized successfully.');
