import { describe, it, expect, vi } from 'vitest';
import { jwtVerify } from 'jose';
import db from '@/lib/db';

// TASK-035 — reativação (ex src/lib/session.test.old + session-expiration.test.old):
// política de sessão do REQ-011, agora como testes Vitest.

describe('TASK-035 — política de sessão (REQ-011)', () => {
    it('boot falha explícito quando JWT_SECRET está ausente', async () => {
        const original = process.env.JWT_SECRET;
        vi.resetModules();
        delete process.env.JWT_SECRET;
        try {
            await expect(import('@/lib/session-edge')).rejects.toThrow(/JWT_SECRET/);
        } finally {
            process.env.JWT_SECRET = original;
            vi.resetModules();
        }
    });

    it('boot falha explícito quando JWT_SECRET é curto demais (< 32 chars)', async () => {
        const original = process.env.JWT_SECRET;
        vi.resetModules();
        process.env.JWT_SECRET = 'curto';
        try {
            await expect(import('@/lib/session-edge')).rejects.toThrow(/JWT_SECRET/);
        } finally {
            process.env.JWT_SECRET = original;
            vi.resetModules();
        }
    });

    it('token expira exatamente em 7 dias (expiração absoluta)', async () => {
        const { signSession } = await import('@/lib/session-edge');
        const token = await signSession({ id: 1, username: 'test', role: 'ADMIN' });
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);

        expect(payload.exp).toBeDefined();
        expect(payload.iat).toBeDefined();
        expect(payload.exp! - payload.iat!).toBe(7 * 24 * 60 * 60);
    });

    it('sessão é revogada quando a senha muda (strict check do pwd_hash)', async () => {
        const { signSession } = await import('@/lib/session-edge');
        const { verifySession } = await import('@/lib/session');

        const admin = db.prepare("SELECT id, password_hash FROM users WHERE username = 'test_admin'").get() as { id: number; password_hash: string };

        // Token válido: pwd_hash bate com o hash atual do banco
        const validToken = await signSession({ id: admin.id, username: 'test_admin', role: 'ADMIN', pwd_hash: admin.password_hash.slice(-10) });
        expect(await verifySession(validToken)).not.toBeNull();

        // Token de sessão antiga: pwd_hash de uma senha que não existe mais
        const staleToken = await signSession({ id: admin.id, username: 'test_admin', role: 'ADMIN', pwd_hash: 'hash_antigo' });
        expect(await verifySession(staleToken)).toBeNull();
    });
});
