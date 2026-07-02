// TASK-029 — runner de migrações UP/DOWN pareadas (constitution §4, REQ-009).
// Toda migração é testada primeiro em uma CÓPIA do banco (integrity_check) e só
// então aplicada no banco real. UP sem DOWN pareado é BLOQUEADOR.
//
// Uso:
//   node db/migrate.mjs up            aplica migrações pendentes
//   node db/migrate.mjs down [n]      reverte as últimas n migrações (padrão 1)
//   node db/migrate.mjs status        lista aplicadas e pendentes
// Banco alvo: process.env.DB_PATH ou keys.db na raiz.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const DEFAULT_DIR = path.resolve(process.cwd(), 'db', 'migrations');

export function listMigrations(dir = DEFAULT_DIR) {
    const files = fs.readdirSync(dir);
    const ups = files.filter(f => f.endsWith('.up.sql')).sort();
    return ups.map(up => {
        const name = up.replace(/\.up\.sql$/, '');
        const down = `${name}.down.sql`;
        if (!files.includes(down)) {
            throw new Error(`BLOQUEADOR: migração "${name}" tem UP sem DOWN pareado (${down} ausente).`);
        }
        return {
            name,
            upPath: path.join(dir, up),
            downPath: path.join(dir, down),
        };
    });
}

function ensureMigrationsTable(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
}

export function getApplied(dbPath) {
    const db = new Database(dbPath);
    try {
        ensureMigrationsTable(db);
        return db.prepare('SELECT name, applied_at FROM _migrations ORDER BY name').all();
    } finally {
        db.close();
    }
}

/** Executa o SQL em uma cópia do banco e valida integridade. Lança se falhar. */
function testOnCopy(dbPath, sql, label) {
    const copyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mig-test-')), 'copy.db');
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, copyPath);
    const copyDb = new Database(copyPath);
    try {
        ensureMigrationsTable(copyDb);
        copyDb.exec(sql);
        const integrity = copyDb.prepare('PRAGMA integrity_check').get();
        if (integrity.integrity_check !== 'ok') {
            throw new Error(`Integridade falhou na cópia ao testar "${label}": ${integrity.integrity_check}`);
        }
    } catch (e) {
        throw new Error(`Migração "${label}" reprovada no teste em cópia — banco real NÃO foi tocado. Causa: ${e.message}`);
    } finally {
        copyDb.close();
        fs.rmSync(path.dirname(copyPath), { recursive: true, force: true });
    }
}

export function applyMigrations(dbPath, dir = DEFAULT_DIR) {
    const migrations = listMigrations(dir);
    const appliedNames = new Set(getApplied(dbPath).map(m => m.name));
    const pending = migrations.filter(m => !appliedNames.has(m.name));
    const applied = [];

    for (const m of pending) {
        const sql = fs.readFileSync(m.upPath, 'utf-8');
        testOnCopy(dbPath, sql, m.name);

        const db = new Database(dbPath);
        try {
            ensureMigrationsTable(db);
            db.exec(sql);
            db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(m.name);
        } finally {
            db.close();
        }
        applied.push(m.name);
    }
    return { applied, skipped: migrations.length - pending.length };
}

export function rollback(dbPath, dir = DEFAULT_DIR, steps = 1) {
    const migrations = listMigrations(dir);
    const appliedList = getApplied(dbPath).map(m => m.name).sort().reverse();
    const toRevert = appliedList.slice(0, steps);
    const reverted = [];

    for (const name of toRevert) {
        const m = migrations.find(mig => mig.name === name);
        if (!m) throw new Error(`Migração aplicada "${name}" não encontrada em ${dir} — impossível reverter.`);
        const sql = fs.readFileSync(m.downPath, 'utf-8');
        testOnCopy(dbPath, sql, `${name} (DOWN)`);

        const db = new Database(dbPath);
        try {
            ensureMigrationsTable(db);
            db.exec(sql);
            db.prepare('DELETE FROM _migrations WHERE name = ?').run(name);
        } finally {
            db.close();
        }
        reverted.push(name);
    }
    return { reverted };
}

// --- CLI ---
const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
    const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || 'keys.db');
    const cmd = process.argv[2] || 'status';
    if (cmd === 'up') {
        const { applied, skipped } = applyMigrations(dbPath);
        console.log(`Aplicadas: ${applied.length ? applied.join(', ') : 'nenhuma'} (já aplicadas: ${skipped})`);
    } else if (cmd === 'down') {
        const steps = parseInt(process.argv[3] || '1', 10);
        const { reverted } = rollback(dbPath, DEFAULT_DIR, steps);
        console.log(`Revertidas: ${reverted.length ? reverted.join(', ') : 'nenhuma'}`);
    } else if (cmd === 'status') {
        const applied = getApplied(dbPath).map(m => m.name);
        const all = listMigrations().map(m => m.name);
        console.log('Aplicadas :', applied.join(', ') || '—');
        console.log('Pendentes :', all.filter(n => !applied.includes(n)).join(', ') || '—');
    } else {
        console.error(`Comando desconhecido: ${cmd}. Use up | down [n] | status.`);
        process.exit(1);
    }
}
