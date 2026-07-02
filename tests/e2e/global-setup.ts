import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';

// TASK-028 — banco EFÊMERO para E2E: nunca tocar o keys.db real.
export const E2E_DB = path.resolve(process.cwd(), 'e2e-test.db');
export const E2E_PASSWORD = 'e2e_password_123';

export default async function globalSetup() {
    // O webServer do Playwright sobe ANTES deste setup e mantém o arquivo aberto —
    // no Windows não é possível apagá-lo. Reset via SQL na mesma conexão SQLite:
    // drop de triggers e tabelas, depois reaplica as migrações oficiais (TASK-029).
    // (O runner .mjs não é importável aqui — loader CJS do Playwright.)
    const db = new Database(E2E_DB);
    db.pragma('foreign_keys = OFF');
    const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all() as { name: string }[];
    for (const t of triggers) db.exec(`DROP TRIGGER IF EXISTS "${t.name}"`);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
    db.pragma('foreign_keys = ON');

    const migrationsDir = path.resolve(process.cwd(), 'db', 'migrations');
    for (const file of fs.readdirSync(migrationsDir).filter(f => f.endsWith('.up.sql')).sort()) {
        db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'));
    }
    const hash = bcrypt.hashSync(E2E_PASSWORD, 10);
    const insertUser = db.prepare(
        'INSERT INTO users (username, password_hash, role, active, full_name, requires_password_change) VALUES (?, ?, ?, 1, ?, 0)'
    );
    insertUser.run('e2e_admin', hash, 'ADMIN', 'Admin E2E');
    insertUser.run('e2e_porteiro', hash, 'PORTEIRO', 'Porteiro E2E');
    insertUser.run('e2e_aluno', hash, 'ALUNO', 'Aluno E2E');
    db.prepare("INSERT INTO keys (name, room, status, active) VALUES ('Chave E2E', 'Sala 101', 'available', 1)").run();
    db.close();
}
