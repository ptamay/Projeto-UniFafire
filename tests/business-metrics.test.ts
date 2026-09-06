import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execute } from '@/lib/pg';

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
    beforeEach(async () => {
        await execute('DELETE FROM key_transactions');
    });

    it('BDD 2: threshold de atraso é o do spec — 12h (não os 4h hardcoded do legado)', async () => {
        expect(OVERDUE_HOURS).toBe(12);
        expect(DOUBLE_CONFIRMATION_TARGET_MINUTES).toBe(10);
    });

    it('BDD 1: taxa de dupla confirmação (≤10min) e tempo mediano de balcão calculados de key_transactions', async () => {
        const inserir = (status: string, inicio: string, confirmado: string | null) => execute(`
            INSERT INTO key_transactions (key_id, user_id, action, status, initiated_at, user_confirmed_at)
            VALUES (1, 1, 'withdraw', $1, $2, $3)
        `, [status, inicio, confirmado]);

        await inserir('completed', minAgo(20), minAgo(15)); // confirmada em 5min (≤10) ✓
        await inserir('completed', minAgo(60), minAgo(25)); // confirmada em 35min (>10) ✗
        await inserir('pending', minAgo(5), null);          // nunca confirmada ✗

        const m = await computeBusinessMetrics(30);
        expect(m.totalTransactions).toBe(3);
        expect(m.doubleConfirmationRate).toBeCloseTo(33.3, 0); // 1 de 3
        expect(m.medianCounterMinutes).toBeCloseTo(20, 0);     // mediana de [5, 35]
    });

    it('BDD 3: sem transações no período → estado vazio claro, sem NaN', async () => {
        const m = await computeBusinessMetrics(30);
        expect(m.totalTransactions).toBe(0);
        expect(m.doubleConfirmationRate).toBeNull();
        expect(m.medianCounterMinutes).toBeNull();
    });

    it('BDD 1b: transações fora da janela não entram no cálculo', async () => {
        await execute(`
            INSERT INTO key_transactions (key_id, user_id, action, status, initiated_at, user_confirmed_at)
            VALUES (1, 1, 'withdraw', 'completed', $1, $2)
        `, [minAgo(60 * 24 * 40), minAgo(60 * 24 * 40 - 5)]); // 40 dias atrás

        const m = await computeBusinessMetrics(30);
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
