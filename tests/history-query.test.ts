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

// TASK-135 (ADR-031) — o Histórico ganha BUSCA. No celular, a primeira tela era
// filtro: seis campos antes de qualquer registro. Agora a busca fica em cima e os
// filtros vão para uma folha; a pergunta "quem pegou a chave do laboratório?" se
// responde digitando — sem acento, sem maiúscula, pelo nome da chave, da sala ou da
// pessoa.
describe('TASK-135 — busca por texto no histórico (q)', () => {
    const ANA = 4;   // test_funcionario
    const BRUNO = 5; // test_aluno

    beforeAll(async () => {
        await withTransaction(async (t) => {
            await t.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
            await t.execute('DELETE FROM history');
        });
        await execute(`INSERT INTO keys (id, name, room, status) OVERRIDING SYSTEM VALUE
            VALUES (92, 'Laboratório de Química', 'Bloco C — sala 5', 'available'),
                   (93, 'Sala 100%', 'Anexo_1', 'available')
            ON CONFLICT (id) DO NOTHING`);
        const ins = (u: number, k: number, a: string, t: string) => execute(
            'INSERT INTO history (user_id, key_id, action, timestamp) VALUES ($1, $2, $3, $4)', [u, k, a, t]);
        await ins(ANA, 92, 'withdraw', '2026-08-20T13:00:00.000Z');
        await ins(BRUNO, 92, 'withdraw', '2026-08-21T13:00:00.000Z');
        await ins(BRUNO, 93, 'withdraw', '2026-08-22T13:00:00.000Z');
    });

    const rodar = (f: Parameters<typeof buildHistoryQuery>[0]) => {
        const q = buildHistoryQuery(f);
        return query<{ key_name: string; employee_name: string }>(q.sql, q.params as never[]);
    };
    const contar = async (f: Parameters<typeof buildHistoryQuery>[0]) => {
        const q = buildHistoryQuery(f);
        return Number((await queryOne<{ total: string }>(q.countSql, q.countParams as never[]))!.total);
    };

    it('acha pelo nome da chave, sem acento e sem maiúscula', async () => {
        const linhas = await rodar({ q: 'laboratorio' });
        expect(linhas).toHaveLength(2);
        expect(linhas.every(l => l.key_name === 'Laboratório de Química')).toBe(true);
    });

    it('acha pela sala', async () => {
        expect(await rodar({ q: 'BLOCO c' })).toHaveLength(2);
    });

    it('acha pela pessoa', async () => {
        const linhas = await rodar({ q: 'funcionario' });
        expect(linhas).toHaveLength(1);
        expect(linhas[0].key_name).toBe('Laboratório de Química');
    });

    it('% e _ valem como letra, não como curinga', async () => {
        expect(await rodar({ q: '100%' })).toHaveLength(1);
        expect(await rodar({ q: 'anexo_' })).toHaveLength(1);
        expect(await rodar({ q: '%' })).toHaveLength(1);
        expect(await rodar({ q: '_' })).toHaveLength(1);
    });

    it('a contagem acompanha a busca, para a paginação não mentir', async () => {
        expect(await contar({ q: 'laboratorio' })).toBe(2);
        expect(await contar({ q: 'nada disso existe' })).toBe(0);
    });

    it('o teto continua valendo: com restritoAoUsuarioId, a busca não vê o histórico alheio', async () => {
        const linhas = await rodar({ q: 'laboratorio', restritoAoUsuarioId: BRUNO, userId: String(ANA) });
        expect(linhas).toHaveLength(1);
        expect(await contar({ q: 'laboratorio', restritoAoUsuarioId: BRUNO })).toBe(1);
    });

    it('termo vazio ou só espaços não filtra nada', async () => {
        expect(await rodar({ q: '   ' })).toHaveLength(3);
        expect(buildHistoryQuery({ q: '  ' }).sql).not.toContain('WHERE');
    });

    it('o termo vai como parâmetro, nunca no texto do SQL', async () => {
        const q = buildHistoryQuery({ q: "x'); DROP TABLE history; --" });
        expect(q.sql).not.toContain('DROP TABLE');
        expect(await rodar({ q: "x'); DROP TABLE history; --" })).toHaveLength(0);
    });
});
