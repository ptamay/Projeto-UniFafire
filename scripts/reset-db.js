const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.cwd(), 'keys.db');

// Close existing connections if possible (hard to do from here, but good practice to mention)
console.log('Resetting database at:', dbPath);

// Delete the file if it exists to ensure a clean slate
if (fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
    console.log('Old database file removed.');
  } catch (e) {
    console.log('Could not delete old database file (might be locked). Proceeding to drop tables.');
  }
}

const db = new Database(dbPath);

db.exec(`
  DROP TABLE IF EXISTS history;
  DROP TABLE IF EXISTS keys;
  DROP TABLE IF EXISTS employees;
  DROP TABLE IF EXISTS users;

  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'USER' -- 'ADMIN', 'USER'
  );
  
  CREATE TABLE employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT
  );

  CREATE TABLE keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    room TEXT,
    status TEXT DEFAULT 'available', -- 'available', 'in_use'
    employee_id INTEGER,
    active INTEGER DEFAULT 1,
    FOREIGN KEY(employee_id) REFERENCES employees(id)
  );

  CREATE TABLE history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    key_id INTEGER,
    action TEXT, -- 'withdraw', 'return'
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(key_id) REFERENCES keys(id)
  );

  CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    target_user_id INTEGER,
    action TEXT, -- 'PROMOTE', 'DEMOTE'
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(actor_id) REFERENCES users(id),
    FOREIGN KEY(target_user_id) REFERENCES users(id)
  );
`);

console.log('Tables created.');

// Create default admin user
const hash = bcrypt.hashSync('admin123', 10);
const insert = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
insert.run('admin', hash, 'ADMIN');

console.log('Default admin user created (user: admin, pass: admin123, role: ADMIN)');
console.log('Database reset successfully.');
