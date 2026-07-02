import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

// TASK-032 — verificação automática do backup diário (REQ-009, spec §5):
// todo run é validado (arquivo existe, tamanho > 0, SQLite íntegro) e registrado
// de forma estruturada e persistente; métrica de confiabilidade consultável.
import { createBackup, getBackupReliability } from '@/lib/backup';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'unifafire-bkp-'));
let caseId = 0;
let backupsDir: string;
let sourceDb: string;

function historyEntries(): Record<string, unknown>[] {
    const file = path.join(backupsDir, 'backup-history.jsonl');
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

beforeEach(() => {
    caseId++;
    backupsDir = path.join(tmpRoot, `backups-${caseId}`);
    sourceDb = path.join(tmpRoot, `source-${caseId}.db`);
    process.env.BACKUPS_DIR = backupsDir;
    process.env.DB_PATH = sourceDb;
});

afterAll(() => {
    delete process.env.BACKUPS_DIR;
    delete process.env.DB_PATH;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('TASK-032 — verificação automática do backup (REQ-009)', () => {
    it('BDD 1/3: backup bem-sucedido é verificado (existe, >0 bytes, SQLite válido) e registrado', () => {
        const db = new Database(sourceDb);
        db.exec('CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1);');
        db.close();

        const ok = createBackup({ force: true });
        expect(ok).toBe(true);

        const entries = historyEntries();
        expect(entries.length).toBe(1);
        const run = entries[0];
        expect(run.status).toBe('success');
        expect(run.verified).toBe(true);
        expect(run.size as number).toBeGreaterThan(0);
        expect(typeof run.duration_ms).toBe('number');
        expect(typeof run.filename).toBe('string');
        expect(fs.existsSync(path.join(backupsDir, run.filename as string))).toBe(true);
    });

    it('BDD 3b: fonte corrompida (não é SQLite) → verificação reprova e run é registrado como falha', () => {
        fs.writeFileSync(sourceDb, 'isto não é um banco sqlite');

        const ok = createBackup({ force: true });
        expect(ok).toBe(false);

        const entries = historyEntries();
        expect(entries.length).toBe(1);
        expect(entries[0].status).toBe('failed');
        expect(entries[0].verified).toBe(false);
    });

    it('BDD 2: métrica de confiabilidade = % de dias com backup concluído com sucesso', () => {
        fs.mkdirSync(backupsDir, { recursive: true });
        const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString();
        const lines = [
            { ts: day(2), status: 'success', verified: true, filename: 'a.db' },
            { ts: day(1), status: 'failed', verified: false, filename: 'b.db' },
            { ts: day(0), status: 'success', verified: true, filename: 'c.db' },
        ].map(e => JSON.stringify(e)).join('\n') + '\n';
        fs.writeFileSync(path.join(backupsDir, 'backup-history.jsonl'), lines);

        const m = getBackupReliability(30);
        expect(m.totalDays).toBe(3);
        expect(m.successDays).toBe(2);
        expect(m.percent).toBeCloseTo(66.7, 0);
    });

    it('BDD 2b: sem registros → métrica vazia clara (sem NaN)', () => {
        fs.mkdirSync(backupsDir, { recursive: true });
        const m = getBackupReliability(30);
        expect(m.totalDays).toBe(0);
        expect(m.percent).toBeNull();
    });
});
