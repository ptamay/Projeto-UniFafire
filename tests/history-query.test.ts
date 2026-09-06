import { describe, it, expect, beforeAll } from 'vitest';
import { query, queryOne, execute, withTransaction } from '@/lib/pg';
import { buildHistoryQuery, HISTORY_ACTIONS } from '@/lib/history-query';

// TASK-056 (Sprint 17) — a trilha de auditoria só filtrava por data/mês/hora.
// As duas perguntas centrais de um controle de chaves — "quem pegou a chave X?"
// e "o que o Fulano pegou?" — não tinham resposta pela tela.

describe('TASK-056 — construção da query de histórico', () => {
    it('sem filtro, não gera cláusula WHERE', async () => {
        const q = buildHistoryQuery({});
        expect(q.sql).not.toContain('WHERE');
        expect(q.countParams).toEqual([]);
    });

    it('filtra por portador da chave', async () => {
        const q = buildHistoryQuery({ userId: '7' });
        expect(q.sql).toMatch(/h\.user_id = \$\d+/);
        expect(q.countParams).toContain(7);
    });

    it('filtra por chave', async () => {
        const q = buildHistoryQuery({ keyId: '3' });
        expect(q.sql).toMatch(/h\.key_id = \$\d+/);
        expect(q.countParams).toContain(3);
    });

    it('filtra por ação', async () => {
        const q = buildHistoryQuery({ action: 'withdraw' });
        expect(q.sql).toMatch(/h\.action = \$\d+/);
        expect(q.countParams).toContain('withdraw');
    });

    it('ignora ação fora do vocabulário conhecido', async () => {
        const q = buildHistoryQuery({ action: "'; DROP TABLE history; --" });
        expect(q.sql).not.toMatch(/h\.action = \$\d+/);
        expect(q.countParams).toEqual([]);
    });

    it('ignora id não numérico em vez de quebrar a consulta', async () => {
        const q = buildHistoryQuery({ userId: 'abc', keyId: '' });
        expect(q.sql).not.toMatch(/h\.user_id = \$\d+/);
        expect(q.countParams).toEqual([]);
    });

    it('combina filtros com AND', async () => {
        const q = buildHistoryQuery({ userId: '7', keyId: '3', action: 'return' });
        expect(q.sql).toMatch(/h\.user_id = \$\d+/);
        expect(q.sql).toMatch(/h\.key_id = \$\d+/);
        expect(q.sql).toMatch(/h\.action = \$\d+/);
        expect(q.countParams).toEqual([7, 3, 'return']);
    });

    it('a query de contagem não leva LIMIT/OFFSET', async () => {
        const q = buildHistoryQuery({ page: 3 });
        expect(q.sql).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
        expect(q.countSql).not.toContain('LIMIT');
        expect(q.params.slice(-2)).toEqual([q.limit, q.offset]);
    });

    it('pagina a partir de 1 e nunca gera offset negativo', async () => {
        expect(buildHistoryQuery({ page: 1 }).offset).toBe(0);
        expect(buildHistoryQuery({ page: 0 }).offset).toBe(0);
        expect(buildHistoryQuery({ page: -5 }).offset).toBe(0);
        expect(buildHistoryQuery({ page: 3, limit: 50 }).offset).toBe(100);
    });

    it('expõe o vocabulário de ações usado pela UI', async () => {
        expect(HISTORY_ACTIONS.map(a => a.value)).toEqual(['withdraw', 'return', 'transfer']);
    });
});

// Prova contra o banco: a query construída realmente devolve as linhas certas.
describe('TASK-056 — filtros executados contra o banco', () => {
    const ANA = 4;   // test_funcionario
    const BRUNO = 5; // test_aluno

    beforeAll(async () => {
        // history e imutavel por trigger (TASK-065): limpeza pelo caminho
        // autorizado do REQ-014.
        await withTransaction(async (t) => {
            await t.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
            await t.execute('DELETE FROM history');
        });
        await execute(`INSERT INTO keys (id, name, room, status) OVERRIDING SYSTEM VALUE
            VALUES (90, 'Chave Lab', 'Lab 1', 'available'), (91, 'Chave Aud', 'Auditorio', 'available')
            ON CONFLICT (id) DO NOTHING`);

        const ins = (u: number, k: number, a: string, t: string) => execute(
            'INSERT INTO history (user_id, key_id, action, timestamp) VALUES ($1, $2, $3, $4)', [u, k, a, t]);
        await ins(ANA, 90, 'withdraw', '2026-08-10T13:00:00.000Z');
        await ins(ANA, 90, 'return', '2026-08-10T17:00:00.000Z');
        await ins(ANA, 91, 'withdraw', '2026-08-11T13:00:00.000Z');
        await ins(BRUNO, 90, 'withdraw', '2026-08-12T13:00:00.000Z');
        await ins(BRUNO, 91, 'transfer', '2026-08-13T13:00:00.000Z');
    });

    const rodar = (f: Parameters<typeof buildHistoryQuery>[0]) => {
        const q = buildHistoryQuery(f);
        return query<{ action: string; key_name: string }>(q.sql, q.params as never[]);
    };

    it('"o que a Ana pegou?" devolve só as movimentações dela', async () => {
        const linhas = await rodar({ userId: String(ANA) });
        expect(linhas).toHaveLength(3);
    });

    it('"quem mexeu na Chave Lab?" devolve as duas pessoas', async () => {
        const linhas = await rodar({ keyId: '90' });
        expect(linhas).toHaveLength(3);
        expect(linhas.every(l => l.key_name === 'Chave Lab')).toBe(true);
    });

    it('cruza portador e chave', async () => {
        const linhas = await rodar({ userId: String(ANA), keyId: '90' });
        expect(linhas).toHaveLength(2);
    });

    it('isola um tipo de movimentação', async () => {
        expect(await rodar({ action: 'transfer' })).toHaveLength(1);
        expect(await rodar({ action: 'withdraw' })).toHaveLength(3);
    });

    it('a contagem acompanha o filtro, para a paginação não mentir', async () => {
        const q = buildHistoryQuery({ userId: String(ANA) });
        const total = Number((await queryOne<{ total: string }>(q.countSql, q.countParams as never[]))!.total);
        expect(total).toBe(3);
    });
});
