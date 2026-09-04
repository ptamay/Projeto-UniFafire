import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// TASK-032 — verificação automática do backup diário (REQ-009, spec §5):
// todo run é validado (arquivo existe, tamanho > 0, SQLite íntegro) e registrado
// de forma estruturada e persistente; métrica de confiabilidade consultável.
import { createBackup, getBackupReliability } from '@/lib/backup';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'unifafire-bkp-'));
let caseId = 0;
let backupsDir: string;
let sourceDb: string;


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
    // TASK-070 (Sprint 21): os dois cenarios que exercitavam a GERACAO do backup
    // foram reescritos. A copia de arquivo deixou de existir — nao ha keys.db para
    // copiar na stack nova, e o disco da hospedagem e efemero. O que a TASK-032
    // entregou e que sobrevive e a METRICA de confiabilidade, coberta abaixo.
    //
    // Os cenarios originais (verificacao da copia com quick_check, e fonte
    // corrompida reprovando) voltam na TASK-078, quando o backup gerenciado do
    // provedor tiver verificacao propria. Registrado aqui para nao se perder.
    it('TASK-070: a geração por cópia de arquivo recusa explicitamente', async () => {
        const r = createBackup();
        expect(r.success, 'nao pode responder sucesso').toBe(false);
        expect(r.error, 'a recusa precisa apontar a substituta').toMatch(/TASK-078/);
    });

    it('TASK-070: a recusa não escreve arquivo nenhum em backups/', async () => {
        const antes = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).length : 0;
        createBackup();
        const depois = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).length : 0;
        expect(depois, 'gerou arquivo apesar de recusar').toBe(antes);
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
