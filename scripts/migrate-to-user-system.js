const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'keys.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = OFF'); // Disable during migration

console.log('=== Migração para Sistema de Usuários ===');
console.log('DB:', dbPath);

// 1. Add new columns to users table
const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);

if (!userColumns.includes('full_name')) {
    db.exec("ALTER TABLE users ADD COLUMN full_name TEXT");
    console.log('✓ users.full_name adicionado');
}
if (!userColumns.includes('matricula')) {
    db.exec("ALTER TABLE users ADD COLUMN matricula TEXT");
    console.log('✓ users.matricula adicionado');
}
if (!userColumns.includes('phone')) {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
    console.log('✓ users.phone adicionado');
}

// Update existing role values: USER -> FUNCIONARIO (legacy USER role)
const oldUserCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'USER'").get();
if (oldUserCount.c > 0) {
    db.prepare("UPDATE users SET role = 'FUNCIONARIO' WHERE role = 'USER'").run();
    console.log(`✓ ${oldUserCount.c} usuário(s) com role 'USER' migrado(s) para 'FUNCIONARIO'`);
}

// 2. Add user_id to keys table (if not exists)
const keyColumns = db.prepare("PRAGMA table_info(keys)").all().map(c => c.name);
if (!keyColumns.includes('user_id')) {
    db.exec("ALTER TABLE keys ADD COLUMN user_id INTEGER REFERENCES users(id)");
    console.log('✓ keys.user_id adicionado');
}

// 3. Create key_transactions table
db.exec(`
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
`);
console.log('✓ tabela key_transactions criada/verificada');

// 4. Add transaction_id to history table
const histColumns = db.prepare("PRAGMA table_info(history)").all().map(c => c.name);
if (!histColumns.includes('transaction_id')) {
    db.exec("ALTER TABLE history ADD COLUMN transaction_id INTEGER REFERENCES key_transactions(id)");
    console.log('✓ history.transaction_id adicionado');
}

// 5. Migrate active employees to users as FUNCIONARIO role
const employees = db.prepare("SELECT * FROM employees WHERE active = 1").all();
let migrated = 0;
for (const emp of employees) {
    // Check if a user with same username already exists
    const username = emp.name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
    const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (!exists) {
        const hash = bcrypt.hashSync('unifafire123', 10);
        db.prepare(`
            INSERT INTO users (username, password_hash, role, full_name, active)
            VALUES (?, ?, 'FUNCIONARIO', ?, 1)
        `).run(username, hash, emp.name);
        migrated++;
    }
}
if (migrated > 0) {
    console.log(`✓ ${migrated} funcionário(s) migrado(s) para usuários (senha padrão: unifafire123)`);
} else {
    console.log('✓ Funcionários: nenhum novo a migrar');
}

// 6. Add 'user_id' and 'username' columns to history (if not already present)
const histColumnsUpdated = db.prepare("PRAGMA table_info(history)").all().map(c => c.name);
if (!histColumnsUpdated.includes('user_id')) {
    db.exec("ALTER TABLE history ADD COLUMN user_id INTEGER REFERENCES users(id)");
    console.log('✓ history.user_id adicionado');
}
if (!histColumnsUpdated.includes('username')) {
    db.exec("ALTER TABLE history ADD COLUMN username TEXT");
    console.log('✓ history.username adicionado');
}

db.pragma('foreign_keys = ON');
console.log('\n=== Migração concluída com sucesso! ===');
console.log('Perfis disponíveis: ADMIN, GESTOR, PORTEIRO, FUNCIONARIO, ALUNO');
