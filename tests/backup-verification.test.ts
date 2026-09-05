import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// TASK-032 — verificação automática do backup diário (REQ-009, spec §5):
// todo run é validado (arquivo existe, tamanho > 0, SQLite íntegro) e registrado
// de forma estruturada e persistente; métrica de confiabilidade consultável.
import { createBackup } from '@/lib/backup';

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
    // copiar na stack nova, e o disco da hospedagem e efemero.
    //
    // Os cenarios originais (verificacao da copia com quick_check, e fonte
    // corrompida reprovando) viraram a verificacao por RESTAURACAO da TASK-078,
    // em `tests/backup-runs.test.ts` — o dump volta numa base descartavel e as
    // contagens e o esquema sao reconciliados contra a origem.
    //
    // A METRICA saiu daqui na TASK-075: deixou de ler
    // `backups/backup-history.jsonl` — arquivo que ninguem escrevia desde a
    // Sprint 21 e que no Vercel nao existiria — e passou a ler `backup_runs`.
    // Os cenarios novos, com os tres estados que a tela precisa distinguir,
    // estao em `tests/backup-reliability.test.ts`.
    //
    // O que resta neste arquivo e so a recusa: a geracao por copia de arquivo
    // nao pode voltar a responder sucesso.

    it('TASK-070: a geração por cópia de arquivo recusa explicitamente', async () => {
        const r = await createBackup();
        expect(r.success, 'nao pode responder sucesso').toBe(false);
        expect(r.error, 'a recusa precisa apontar a substituta').toMatch(/TASK-078/);
    });

    it('TASK-070: a recusa não escreve arquivo nenhum em backups/', async () => {
        const antes = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).length : 0;
        await createBackup();
        const depois = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).length : 0;
        expect(depois, 'gerou arquivo apesar de recusar').toBe(antes);
    });
});
