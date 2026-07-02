import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

// TASK-029 — estrutura db/migrations com UP/DOWN pareados e runner que testa
// em cópia do banco antes de aplicar no real (constitution §4, REQ-009).
import { listMigrations, applyMigrations, rollback, getApplied } from '../db/migrate.mjs';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db', 'migrations');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'unifafire-mig-'));
let dbFile: string;
let seq = 0;

beforeEach(() => {
    dbFile = path.join(tmpRoot, `test-${++seq}.db`);
});

afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('TASK-029 — migrações UP/DOWN pareadas', () => {
    it('BDD 0: todo .up.sql no repositório tem .down.sql pareado pelo mesmo prefixo', () => {
        const migrations = listMigrations(MIGRATIONS_DIR);
        expect(migrations.length).toBeGreaterThan(0);
        for (const m of migrations) {
            expect(fs.existsSync(m.upPath), `${m.name} sem UP`).toBe(true);
            expect(fs.existsSync(m.downPath), `${m.name} sem DOWN pareado — BLOQUEADOR`).toBe(true);
        }
    });

    it('BDD 1: aplicar em banco novo cria o schema baseline e registra em _migrations', () => {
        const result = applyMigrations(dbFile, MIGRATIONS_DIR);
        expect(result.applied.length).toBeGreaterThan(0);

        const db = new Database(dbFile, { readonly: true });
        const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
        for (const t of ['users', 'keys', 'history', 'key_transactions', 'action_logs', 'settings']) {
            expect(tables, `tabela ${t} ausente`).toContain(t);
        }
        const applied = getApplied(dbFile);
        expect(applied.length).toBe(result.applied.length);
        db.close();
    });

    it('BDD 1b: aplicar é idempotente — segunda execução não tem pendências', () => {
        applyMigrations(dbFile, MIGRATIONS_DIR);
        const second = applyMigrations(dbFile, MIGRATIONS_DIR);
        expect(second.applied.length).toBe(0);
    });

    it('BDD 2: rollback aplica o DOWN e remove o registro', () => {
        applyMigrations(dbFile, MIGRATIONS_DIR);
        const before = getApplied(dbFile).length;
        rollback(dbFile, MIGRATIONS_DIR, 1);
        expect(getApplied(dbFile).length).toBe(before - 1);
    });

    it('BDD 3: migração sem DOWN pareado é BLOQUEADOR — runner recusa', () => {
        const brokenDir = fs.mkdtempSync(path.join(tmpRoot, 'broken-'));
        fs.writeFileSync(path.join(brokenDir, '20260101000000_sem_down.up.sql'), 'CREATE TABLE x (id INTEGER);');
        expect(() => listMigrations(brokenDir)).toThrow(/DOWN/i);
    });

    it('BDD 4: migração com SQL inválido falha na CÓPIA e não toca o banco real', () => {
        applyMigrations(dbFile, MIGRATIONS_DIR); // baseline ok
        const stateBefore = getApplied(dbFile).map(m => m.name);

        const badDir = fs.mkdtempSync(path.join(tmpRoot, 'bad-'));
        // Copia as migrações reais + adiciona uma quebrada por cima
        for (const f of fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))) {
            fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(badDir, f));
        }
        fs.writeFileSync(path.join(badDir, '29990101000000_quebrada.up.sql'), 'CREATE TABEL oops;');
        fs.writeFileSync(path.join(badDir, '29990101000000_quebrada.down.sql'), '-- noop');

        expect(() => applyMigrations(dbFile, badDir)).toThrow();

        // Banco real intacto: mesmas migrações aplicadas, integridade ok
        expect(getApplied(dbFile).map(m => m.name)).toEqual(stateBefore);
        const db = new Database(dbFile, { readonly: true });
        const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
        expect(integrity.integrity_check).toBe('ok');
        db.close();
    });
});
