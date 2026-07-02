import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// TASK-033 — logger estruturado: JSON por linha, severidades, máscara de sensíveis,
// persistência em arquivo com rotação diária e helper de timing de rotas.
import { logStructured, logTiming, maskSensitive, currentLogFilePath } from '@/lib/structured-logger';

const tmpLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unifafire-logs-'));

function readLogLines(): Record<string, unknown>[] {
    const file = currentLogFilePath();
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
}

beforeAll(() => {
    process.env.LOG_DIR = tmpLogDir;
});

afterAll(() => {
    delete process.env.LOG_DIR;
    fs.rmSync(tmpLogDir, { recursive: true, force: true });
});

describe('TASK-033 — logger estruturado', () => {
    it('BDD 1: escreve JSON por linha com timestamp, severidade e mensagem, em arquivo com rotação diária', () => {
        logStructured('info', 'evento_teste', { contexto: 'abc' });

        const file = currentLogFilePath();
        // Rotação diária: nome do arquivo contém a data corrente
        const today = new Date().toISOString().slice(0, 10);
        expect(path.basename(file)).toContain(today);

        const lines = readLogLines();
        const entry = lines.find(l => l.msg === 'evento_teste');
        expect(entry).toBeDefined();
        expect(entry!.level).toBe('info');
        expect(typeof entry!.ts).toBe('string');
        expect(new Date(entry!.ts as string).toString()).not.toBe('Invalid Date');
        expect(entry!.contexto).toBe('abc');
    });

    it('BDD 1b: suporta as quatro severidades', () => {
        for (const level of ['debug', 'info', 'warn', 'error'] as const) {
            logStructured(level, `nivel_${level}`);
        }
        const lines = readLogLines();
        for (const level of ['debug', 'info', 'warn', 'error']) {
            expect(lines.find(l => l.msg === `nivel_${level}` && l.level === level)).toBeDefined();
        }
    });

    it('BDD 2: mascara campos sensíveis (senha, hash, token, cookie) em qualquer profundidade', () => {
        logStructured('info', 'login_debug', {
            username: 'ptamay',
            password: 'super-secreta',
            senha: 'outra-secreta',
            password_hash: '$2b$10$abcdef',
            nested: { token: 'jwt-aqui', session_cookie: 'cookie-aqui', ok: 'visivel' },
        });

        const entry = readLogLines().find(l => l.msg === 'login_debug')!;
        expect(entry.username).toBe('ptamay');
        expect(entry.password).toBe('***');
        expect(entry.senha).toBe('***');
        expect(entry.password_hash).toBe('***');
        const nested = entry.nested as Record<string, unknown>;
        expect(nested.token).toBe('***');
        expect(nested.session_cookie).toBe('***');
        expect(nested.ok).toBe('visivel');

        // Garantia bruta: nenhum valor sensível aparece no arquivo
        const raw = fs.readFileSync(currentLogFilePath(), 'utf-8');
        expect(raw).not.toContain('super-secreta');
        expect(raw).not.toContain('jwt-aqui');
        expect(raw).not.toContain('$2b$10$abcdef');
    });

    it('BDD 2b: maskSensitive não altera o objeto original', () => {
        const original = { password: 'abc', user: 'x' };
        maskSensitive(original);
        expect(original.password).toBe('abc');
    });

    it('BDD 3: logTiming registra rota e duração em ms', () => {
        logTiming('POST /api/auth/login', 42.7);
        const entry = readLogLines().find(l => l.type === 'timing' && l.route === 'POST /api/auth/login')!;
        expect(entry).toBeDefined();
        expect(entry.duration_ms).toBe(43);
        expect(entry.level).toBe('info');
    });

    it('BDD 3b: timing acima de 500ms (alvo p95 do spec §6) loga como warn', () => {
        logTiming('POST /api/transactions', 812);
        const entry = readLogLines().find(l => l.type === 'timing' && l.route === 'POST /api/transactions')!;
        expect(entry.level).toBe('warn');
    });

    it('BDD 4: logAction (auditoria) também emite pelo logger estruturado', async () => {
        const { logAction } = await import('@/lib/logger');
        await logAction(null, 'test_admin', 'TEST_AUDIT_ACTION', 'TestTarget', 'detalhe');
        const entry = readLogLines().find(l => l.msg === 'audit_action' && l.action === 'TEST_AUDIT_ACTION');
        expect(entry).toBeDefined();
        expect(entry!.target).toBe('TestTarget');
    });
});
