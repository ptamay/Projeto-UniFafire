import { describe, it, expect, vi, beforeEach } from 'vitest';
import db from '@/lib/db';

// TASK-050 (REQ-029c) — /api/metrics/frequent-keys passa a distinguir o papel:
// portaria (ADMIN/GESTOR/PORTEIRO) recebe as chaves mais movimentadas GLOBALMENTE
// (frequência da portaria); usuário comum segue recebendo só as próprias.

vi.mock('next/headers', () => ({
    cookies: () => ({ get: vi.fn().mockReturnValue({ value: 'mocked_token' }) }),
    headers: () => Promise.resolve(new Headers()),
}));

let currentSession: { id: number; role: string; username: string } | null = null;
vi.mock('@/lib/session', () => ({
    verifySession: vi.fn().mockImplementation(() => Promise.resolve(currentSession)),
}));

// ids dos usuários seedados em tests/setup.ts
const PORTEIRO = 3;
const ALUNO = 5;
const ALUNO2 = 6;

async function callFrequentKeys(): Promise<number[]> {
    const { GET } = await import('@/app/api/metrics/frequent-keys/route');
    const res = await GET();
    expect(res.status).toBe(200);
    return res.json();
}

describe('TASK-050 — frequência de chaves por papel (REQ-029c)', () => {
    let keyLab: number;
    let keySala: number;
    let keyPorteiro: number;

    beforeEach(() => {
        db.prepare('DELETE FROM history').run();
        db.prepare("DELETE FROM keys WHERE name LIKE 'FreqTest%'").run();
        const ins = db.prepare("INSERT INTO keys (name, room, status, active) VALUES (?, 'x', 'available', 1)");
        keyLab = Number(ins.run('FreqTest Lab').lastInsertRowid);
        keySala = Number(ins.run('FreqTest Sala').lastInsertRowid);
        keyPorteiro = Number(ins.run('FreqTest Porteiro').lastInsertRowid);

        const h = db.prepare("INSERT INTO history (key_id, user_id, username, action) VALUES (?, ?, ?, 'withdraw')");
        // keyLab: muito movimentada pela portaria como um todo (vários usuários), 3×
        h.run(keyLab, ALUNO, 'test_aluno');
        h.run(keyLab, ALUNO2, 'test_aluno2');
        h.run(keyLab, ALUNO, 'test_aluno');
        // keySala: movimentada 2× por alunos
        h.run(keySala, ALUNO2, 'test_aluno2');
        h.run(keySala, ALUNO2, 'test_aluno2');
        // keyPorteiro: retirada só 1× pelo PRÓPRIO porteiro
        h.run(keyPorteiro, PORTEIRO, 'test_porteiro');
    });

    it('BDD: portaria recebe as chaves mais movimentadas GLOBALMENTE (não as próprias)', async () => {
        currentSession = { id: PORTEIRO, role: 'PORTEIRO', username: 'test_porteiro' };
        const ids = await callFrequentKeys();
        // keyLab (3 retiradas globais) vem antes de keySala (2), e keyPorteiro (1×
        // do próprio) NÃO domina só por ser dele.
        expect(ids[0]).toBe(keyLab);
        expect(ids).toContain(keySala);
        expect(ids.indexOf(keyLab)).toBeLessThan(ids.indexOf(keySala));
    });

    it('BDD (regressão): usuário comum recebe apenas as chaves que ELE mais retira', async () => {
        currentSession = { id: ALUNO2, role: 'ALUNO', username: 'test_aluno2' };
        const ids = await callFrequentKeys();
        // aluno2 retirou keySala 2× e keyLab 1× — só as dele, keyPorteiro fora.
        expect(ids).toContain(keySala);
        expect(ids).toContain(keyLab);
        expect(ids).not.toContain(keyPorteiro);
        expect(ids.indexOf(keySala)).toBeLessThan(ids.indexOf(keyLab));
    });
});
