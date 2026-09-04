import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { POST as RestorePOST } from '@/app/api/backups/restore/route';
import { POST as ImportPOST } from '@/app/api/backups/import/route';

// TASK-068 (Sprint 21) — as duas rotas de backup por cópia de arquivo.
//
// Ambas dependem de `resetConnection()`: fechar o banco, trocar o ARQUIVO em
// disco e reabrir. No Postgres não há arquivo para trocar, e em execução
// serverless não há processo longo para reabrir. Não é uma conversão difícil —
// é uma operação que deixa de existir.
//
// O ADR-012 já classificou essas rotas como "desativar, não deixar quebrado", e
// o desenho definitivo (backup gerenciado do provedor + verificação agendada) é
// a TASK-078, na Etapa 7. Aqui elas apenas param de fingir: um ADMIN que clicar
// em "restaurar" precisa receber uma recusa explícita, não um sucesso mentiroso
// nem um stack trace.
//
// O acesso continua restrito a ADMIN: a recusa é sobre a operação, não uma porta
// nova. Quem não é ADMIN segue levando 403 antes de chegar aqui (§3.5).

vi.mock('next/headers', () => ({
    cookies: () => ({ get: vi.fn().mockReturnValue({ value: 'token' }) }),
}));

let sessaoAtual: { id: number; role: string; username: string } | null =
    { id: 1, role: 'ADMIN', username: 'admin' };

vi.mock('@/lib/session', () => ({
    verifySession: vi.fn().mockImplementation(() => Promise.resolve(sessaoAtual)),
}));

function requisicaoRestore(filename = 'keys_backup_2026-07-06.db') {
    return new Request('http://localhost/api/backups/restore', {
        method: 'POST',
        body: JSON.stringify({ filename }),
    }) as never;
}

async function requisicaoImport() {
    const form = new FormData();
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'qualquer.db'));
    return new Request('http://localhost/api/backups/import', {
        method: 'POST',
        body: form,
    }) as never;
}

describe('TASK-068 — restore por cópia de arquivo não finge funcionar', () => {
    it('BDD 7: responde erro explícito citando a TASK-078', async () => {
        sessaoAtual = { id: 1, role: 'ADMIN', username: 'admin' };
        const res = await RestorePOST(requisicaoRestore());
        const body = await res.json();

        expect(res.ok, 'não pode responder sucesso').toBe(false);
        expect(res.status).toBe(503);
        expect(body.error).toMatch(/TASK-078/);
        expect(body.success).toBeUndefined();
    });

    it('BDD 7: não altera estado — o keys.db não é tocado', async () => {
        const dbPath = path.resolve(process.cwd(), 'keys.db');
        const antes = fs.existsSync(dbPath) ? fs.statSync(dbPath).mtimeMs : null;

        await RestorePOST(requisicaoRestore());

        const depois = fs.existsSync(dbPath) ? fs.statSync(dbPath).mtimeMs : null;
        expect(depois).toBe(antes);
    });

    it('BDD 7: continua exigindo ADMIN — a recusa é da operação, não da porta', async () => {
        sessaoAtual = { id: 9, role: 'PORTEIRO', username: 'porteiro' };
        const res = await RestorePOST(requisicaoRestore());
        expect(res.status, 'não-ADMIN tem de levar 403, não a mensagem de desativado').toBe(403);
        sessaoAtual = { id: 1, role: 'ADMIN', username: 'admin' };
    });
});

describe('TASK-068 — import por upload de arquivo não finge funcionar', () => {
    it('BDD 7: responde erro explícito citando a TASK-078', async () => {
        sessaoAtual = { id: 1, role: 'ADMIN', username: 'admin' };
        const res = await ImportPOST(await requisicaoImport());
        const body = await res.json();

        expect(res.ok).toBe(false);
        expect(res.status).toBe(503);
        expect(body.error).toMatch(/TASK-078/);
    });

    it('BDD 7: não altera estado — o keys.db não é sobrescrito', async () => {
        const dbPath = path.resolve(process.cwd(), 'keys.db');
        const antes = fs.existsSync(dbPath) ? fs.statSync(dbPath).mtimeMs : null;

        await ImportPOST(await requisicaoImport());

        const depois = fs.existsSync(dbPath) ? fs.statSync(dbPath).mtimeMs : null;
        expect(depois).toBe(antes);
    });

    it('BDD 7: nenhuma das duas rotas importa mais resetConnection', () => {
        for (const rota of ['restore', 'import']) {
            const fonte = fs.readFileSync(
                path.resolve(process.cwd(), `src/app/api/backups/${rota}/route.ts`), 'utf-8',
            );
            expect(fonte, `${rota} ainda depende de resetConnection`).not.toMatch(/resetConnection/);
        }
    });
});
