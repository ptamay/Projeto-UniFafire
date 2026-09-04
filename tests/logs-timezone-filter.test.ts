import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GET as LogsGET } from '@/app/api/logs/route';
import { execute } from '@/lib/pg';

vi.mock('next/headers', () => ({
    cookies: () => ({ get: vi.fn().mockReturnValue({ value: 'mocked_token' }) }),
    headers: () => ({ get: vi.fn().mockReturnValue(null) }),
}));

vi.mock('@/lib/session', () => ({
    verifySession: vi.fn().mockResolvedValue({ id: 1, role: 'ADMIN', username: 'test_admin' }),
}));

// TASK-055 (Sprint 16) — prova de ponta a ponta pela rota real: o filtro chega no
// fuso de quem opera (Recife, UTC-3) e a coluna está em UTC. Um registro das
// 22:30 do dia 04 é gravado como 05T01:30Z; filtrar "dia 04" precisa encontrá-lo,
// e filtrar "dia 05" precisa não encontrá-lo.
const NOITE_DIA_4 = '2026-07-05T01:30:00.000Z'; // 04/07 22:30 em Recife
const TARDE_DIA_5 = '2026-07-05T17:00:00.000Z'; // 05/07 14:00 em Recife

async function buscar(params: string) {
    const res = await LogsGET(new Request(`http://localhost/api/logs?${params}`));
    const body = await res.json();
    return (body.logs ?? body) as { action: string }[];
}

describe('TASK-055 — filtro de data/hora dos logs no fuso do operador', () => {
    beforeAll(async () => {
        await execute('DELETE FROM action_logs');
        const ins = (a: string, b: string, c: string, d: string) => execute(
            'INSERT INTO action_logs (user_id, username, action, target, timestamp) VALUES (1, $1, $2, $3, $4)',
            [a, b, c, d],
        );
        await ins('test_admin', 'MOV_NOITE_DIA_4', 'Chave', NOITE_DIA_4);
        await ins('test_admin', 'MOV_TARDE_DIA_5', 'Chave', TARDE_DIA_5);
    });

    it('encontra a movimentação das 22:30 no dia local em que ela aconteceu', async () => {
        const acoes = (await buscar('date=2026-07-04')).map(l => l.action);
        expect(acoes, 'registro das 22:30 pertence ao dia 04 local').toContain('MOV_NOITE_DIA_4');
        expect(acoes).not.toContain('MOV_TARDE_DIA_5');
    });

    it('não atribui a movimentação da noite ao dia seguinte', async () => {
        const acoes = (await buscar('date=2026-07-05')).map(l => l.action);
        expect(acoes).toContain('MOV_TARDE_DIA_5');
        expect(acoes, 'registro das 22:30 do dia 04 não pode aparecer no dia 05').not.toContain('MOV_NOITE_DIA_4');
    });

    it('filtra pela hora que o operador vê na tela, não pela hora UTC', async () => {
        const asDuasDaTarde = (await buscar('hour=14')).map(l => l.action);
        expect(asDuasDaTarde, '14h local == 17h UTC').toContain('MOV_TARDE_DIA_5');

        const dezessete = (await buscar('hour=17')).map(l => l.action);
        expect(dezessete, 'nada acontece às 17h locais neste conjunto').not.toContain('MOV_TARDE_DIA_5');
    });

    it('o mês local inclui a movimentação da virada de dia', async () => {
        const acoes = (await buscar('month=2026-07')).map(l => l.action);
        expect(acoes).toContain('MOV_NOITE_DIA_4');
        expect(acoes).toContain('MOV_TARDE_DIA_5');
    });
});
