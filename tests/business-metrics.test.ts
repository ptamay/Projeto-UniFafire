import { describe, it, expect, vi, beforeEach } from 'vitest';
import db from '@/lib/db';

// TASK-034 — métricas de negócio (spec §5) + threshold de atraso do spec (12h).
import { OVERDUE_HOURS, DOUBLE_CONFIRMATION_TARGET_MINUTES } from '@/lib/business-rules';
import { computeBusinessMetrics } from '@/lib/business-metrics';

vi.mock('next/headers', () => ({
    cookies: () => ({
        get: vi.fn().mockReturnValue({ value: 'mocked_token' }),
    }),
    headers: () => Promise.resolve(new Headers()),
}));

let currentSession: { id: number; role: string; username: string } | null = { id: 1, role: 'ADMIN', username: 'test_admin' };
vi.mock('@/lib/session', () => ({
    verifySession: vi.fn().mockImplementation(() => Promise.resolve(currentSession)),
}));

const minAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

describe('TASK-034 — métricas de negócio (spec §5)', () => {
    beforeEach(() => {
        db.prepare('DELETE FROM key_transactions').run();
    });

    it('BDD 2: threshold de atraso é o do spec — 12h (não os 4h hardcoded do legado)', () => {
        expect(OVERDUE_HOURS).toBe(12);
        expect(DOUBLE_CONFIRMATION_TARGET_MINUTES).toBe(10);
    });

    it('BDD 1: taxa de dupla confirmação (≤10min) e tempo mediano de balcão calculados de key_transactions', () => {
        const insert = db.prepare(`
            INSERT INTO key_transactions (key_id, user_id, action, status, initiated_at, user_confirmed_at)
            VALUES (1, 1, 'withdraw', ?, ?, ?)
        `);
        insert.run('completed', minAgo(20), minAgo(15)); // confirmada em 5min (≤10) ✓
        insert.run('completed', minAgo(60), minAgo(25)); // confirmada em 35min (>10) ✗
        insert.run('pending', minAgo(5), null);          // nunca confirmada ✗

        const m = computeBusinessMetrics(30);
        expect(m.totalTransactions).toBe(3);
        expect(m.doubleConfirmationRate).toBeCloseTo(33.3, 0); // 1 de 3
        expect(m.medianCounterMinutes).toBeCloseTo(20, 0);     // mediana de [5, 35]
    });

    it('BDD 3: sem transações no período → estado vazio claro, sem NaN', () => {
        const m = computeBusinessMetrics(30);
        expect(m.totalTransactions).toBe(0);
        expect(m.doubleConfirmationRate).toBeNull();
        expect(m.medianCounterMinutes).toBeNull();
    });

    it('BDD 1b: transações fora da janela não entram no cálculo', () => {
        db.prepare(`
            INSERT INTO key_transactions (key_id, user_id, action, status, initiated_at, user_confirmed_at)
            VALUES (1, 1, 'withdraw', 'completed', ?, ?)
        `).run(minAgo(60 * 24 * 40), minAgo(60 * 24 * 40 - 5)); // 40 dias atrás

        const m = computeBusinessMetrics(30);
        expect(m.totalTransactions).toBe(0);
    });

    it('RBAC: PORTEIRO consulta a rota de métricas; ALUNO não', async () => {
        const { GET } = await import('@/app/api/metrics/business/route');

        currentSession = { id: 3, role: 'PORTEIRO', username: 'test_porteiro' };
        const ok = await GET();
        expect(ok.status).toBe(200);
        const body = await ok.json();
        expect(body).toHaveProperty('doubleConfirmationRate');

        currentSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };
        const denied = await GET();
        expect(denied.status).toBe(403);
    });
});
