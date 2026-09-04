import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { queryOne, execute } from '@/lib/pg';

// TASK-031 — trilha persistente das operações destrutivas (REQ-014):
// registro prévio em destino que sobrevive à limpeza do banco.

vi.mock('next/headers', () => ({
    cookies: () => ({
        get: vi.fn().mockReturnValue({ value: 'mocked_token' }),
    }),
    headers: () => Promise.resolve(new Headers()),
}));

vi.mock('@/lib/session', () => ({
    verifySession: vi.fn().mockImplementation(() =>
        Promise.resolve({ id: 1, role: 'ADMIN', username: 'test_admin' })
    ),
}));

const tmpLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unifafire-destr-'));

function readEntries(): Record<string, unknown>[] {
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(tmpLogDir, `app-${day}.log`);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

beforeAll(async () => {
    process.env.LOG_DIR = tmpLogDir;
});

afterAll(async () => {
    delete process.env.LOG_DIR;
    fs.rmSync(tmpLogDir, { recursive: true, force: true });
});

describe('TASK-031 — trilha destrutiva persistente (REQ-014)', () => {
    it('BDD 1/2: clear-database grava registro prévio E de conclusão em destino que sobrevive à limpeza', async () => {
        // Estado: trilha antiga no banco que SERÁ apagada pela operação
        await execute(`INSERT INTO action_logs (user_id, username, action, target) VALUES (1, 'test_admin', 'ANTIGA', 'x')`);
        await execute(`INSERT INTO history (key_id, user_id, username, action) VALUES (1, 1, 'test_admin', 'withdraw')`);

        const { POST } = await import('@/app/api/settings/clear-database/route');
        const res = await POST();
        expect(res.status).toBe(200);

        // Banco limpo (inclusive a própria trilha antiga em action_logs)
        const remainingHistory = Number((await queryOne<{ c: string }>('SELECT COUNT(*) as c FROM history'))?.c);
        expect(remainingHistory).toBe(0);
        const oldTrail = Number((await queryOne<{ c: string }>("SELECT COUNT(*) as c FROM action_logs WHERE action = 'ANTIGA'"))?.c);
        expect(oldTrail).toBe(0);

        // Mas a trilha estruturada em ARQUIVO sobreviveu: prévia + conclusão
        const entries = readEntries().filter(e => e.msg === 'destructive_operation' && e.op === 'clear-database');
        const pre = entries.find(e => e.phase === 'pre');
        const done = entries.find(e => e.phase === 'done');
        expect(pre, 'registro PRÉVIO ausente').toBeDefined();
        expect(done, 'registro de conclusão ausente').toBeDefined();
        expect(pre!.username).toBe('test_admin');
        expect(pre!.level).toBe('warn');
    });

    it('BDD 3: history/clear grava a trilha ANTES da deleção (action_logs + arquivo)', async () => {
        // Re-semeia uma chave (o clear-database do teste anterior limpou keys)
        const keyId = (await queryOne<{ id: number }>(
            "INSERT INTO keys (name, room, status) VALUES ('Chave Trilha', 'Sala 102', 'available') RETURNING id",
        ))!.id;
        await execute(`INSERT INTO history (key_id, user_id, username, action) VALUES ($1, 1, 'test_admin', 'withdraw')`, [keyId]);

        const { DELETE } = await import('@/app/api/history/clear/route');
        const res = await DELETE();
        expect(res.status).toBe(200);

        // Trilha no banco (action_logs não é alvo do history/clear)
        // action_logs migrou para o Postgres na fatia (a): logAction grava la.
        const dbTrail = await queryOne<{ details: string }>(
            "SELECT details FROM action_logs WHERE action = 'CLEAR_HISTORY' ORDER BY id DESC LIMIT 1",
        );
        expect(dbTrail).toBeDefined();
        expect(dbTrail?.details).toMatch(/Iniciando/i);

        // Trilha prévia no arquivo
        const pre = readEntries().find(e => e.msg === 'destructive_operation' && e.op === 'history-clear' && e.phase === 'pre');
        expect(pre).toBeDefined();
    });
});
