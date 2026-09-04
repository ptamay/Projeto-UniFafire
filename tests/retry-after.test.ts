import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/auth/login/route';
import { RATE_LIMIT_MAX } from '@/lib/security-profile';

vi.mock('next/headers', () => ({
    cookies: () => ({ get: vi.fn(), set: vi.fn() }),
    headers: () => ({ get: vi.fn().mockReturnValue(null) }),
}));

// TASK-061 (Sprint 19) — constitution §2.6 exige "Resposta 429 com Retry-After".
// A rota devolvia 429 sem o header, deixando o cliente sem saber quando voltar.
// Divergência encontrada ao reescrever §2.6 para o ADR-012.

function requisicao(ip: string) {
    return new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'alguem', password: 'errada' }),
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    });
}

describe('TASK-061 — 429 informa quando tentar de novo (§2.6)', () => {
    it('a resposta 429 traz Retry-After em segundos', async () => {
        const ip = '10.61.0.1';
        for (let i = 0; i < RATE_LIMIT_MAX; i++) await POST(requisicao(ip));

        const res = await POST(requisicao(ip));
        expect(res.status).toBe(429);

        const retry = res.headers.get('Retry-After');
        expect(retry, 'header Retry-After ausente').not.toBeNull();
        expect(Number(retry), 'Retry-After deve ser inteiro de segundos').toBeGreaterThan(0);
        expect(Number(retry)).toBeLessThanOrEqual(60);
    });

    it('a resposta 423 de lockout também informa a espera', async () => {
        const ip = '10.61.0.2';
        for (let i = 0; i < 5; i++) await POST(requisicao(ip));

        const res = await POST(requisicao(ip));
        expect(res.status).toBe(423);
        expect(Number(res.headers.get('Retry-After')), 'lockout de 15 min').toBe(900);
    });
});
