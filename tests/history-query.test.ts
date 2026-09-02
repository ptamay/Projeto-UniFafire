import { describe, it, expect, beforeAll } from 'vitest';
import db from '@/lib/db';
import { buildHistoryQuery, HISTORY_ACTIONS } from '@/lib/history-query';

// TASK-056 (Sprint 17) — a trilha de auditoria só filtrava por data/mês/hora.
// As duas perguntas centrais de um controle de chaves — "quem pegou a chave X?"
// e "o que o Fulano pegou?" — não tinham resposta pela tela.

describe('TASK-056 — construção da query de histórico', () => {
    it('sem filtro, não gera cláusula WHERE', () => {
        const q = buildHistoryQuery({});
        expect(q.sql).not.toContain('WHERE');
        expect(q.countParams).toEqual([]);
    });

    it('filtra por portador da chave', () => {
        const q = buildHistoryQuery({ userId: '7' });
        expect(q.sql).toContain('h.user_id = ?');
        expect(q.countParams).toContain(7);
    });

    it('filtra por chave', () => {
        const q = buildHistoryQuery({ keyId: '3' });
        expect(q.sql).toContain('h.key_id = ?');
        expect(q.countParams).toContain(3);
    });

    it('filtra por ação', () => {
        const q = buildHistoryQuery({ action: 'withdraw' });
        expect(q.sql).toContain('h.action = ?');
        expect(q.countParams).toContain('withdraw');
    });

    it('ignora ação fora do vocabulário conhecido', () => {
        const q = buildHistoryQuery({ action: "'; DROP TABLE history; --" });
        expect(q.sql).not.toContain('h.action = ?');
        expect(q.countParams).toEqual([]);
    });

    it('ignora id não numérico em vez de quebrar a consulta', () => {
        const q = buildHistoryQuery({ userId: 'abc', keyId: '' });
        expect(q.sql).not.toContain('h.user_id = ?');
        expect(q.countParams).toEqual([]);
    });

    it('combina filtros com AND', () => {
        const q = buildHistoryQuery({ userId: '7', keyId: '3', action: 'return' });
        expect(q.sql).toContain('h.user_id = ?');
        expect(q.sql).toContain('h.key_id = ?');
        expect(q.sql).toContain('h.action = ?');
        expect(q.countParams).toEqual([7, 3, 'return']);
    });

    it('a query de contagem não leva LIMIT/OFFSET', () => {
        const q = buildHistoryQuery({ page: 3 });
        expect(q.sql).toContain('LIMIT ? OFFSET ?');
        expect(q.countSql).not.toContain('LIMIT');
        expect(q.params.slice(-2)).toEqual([q.limit, q.offset]);
    });

    it('pagina a partir de 1 e nunca gera offset negativo', () => {
        expect(buildHistoryQuery({ page: 1 }).offset).toBe(0);
        expect(buildHistoryQuery({ page: 0 }).offset).toBe(0);
        expect(buildHistoryQuery({ page: -5 }).offset).toBe(0);
        expect(buildHistoryQuery({ page: 3, limit: 50 }).offset).toBe(100);
    });

    it('expõe o vocabulário de ações usado pela UI', () => {
        expect(HISTORY_ACTIONS.map(a => a.value)).toEqual(['withdraw', 'return', 'transfer']);
    });
});

// Prova contra o banco: a query construída realmente devolve as linhas certas.
describe('TASK-056 — filtros executados contra o banco', () => {
    const ANA = 4;   // test_funcionario
    const BRUNO = 5; // test_aluno

    beforeAll(() => {
        db.prepare('DELETE FROM history').run();
        db.prepare("INSERT INTO keys (id, name, room, status) VALUES (90, 'Chave Lab', 'Lab 1', 'available')").run();
        db.prepare("INSERT INTO keys (id, name, room, status) VALUES (91, 'Chave Aud', 'Auditorio', 'available')").run();

        const ins = db.prepare(
            'INSERT INTO history (user_id, key_id, action, timestamp) VALUES (?, ?, ?, ?)'
        );
        ins.run(ANA, 90, 'withdraw', '2026-08-10T13:00:00.000Z');
        ins.run(ANA, 90, 'return', '2026-08-10T17:00:00.000Z');
        ins.run(ANA, 91, 'withdraw', '2026-08-11T13:00:00.000Z');
        ins.run(BRUNO, 90, 'withdraw', '2026-08-12T13:00:00.000Z');
        ins.run(BRUNO, 91, 'transfer', '2026-08-13T13:00:00.000Z');
    });

    const rodar = (f: Parameters<typeof buildHistoryQuery>[0]) => {
        const q = buildHistoryQuery(f);
        return db.prepare(q.sql).all(...q.params) as { action: string; key_name: string }[];
    };

    it('"o que a Ana pegou?" devolve só as movimentações dela', () => {
        const linhas = rodar({ userId: String(ANA) });
        expect(linhas).toHaveLength(3);
    });

    it('"quem mexeu na Chave Lab?" devolve as duas pessoas', () => {
        const linhas = rodar({ keyId: '90' });
        expect(linhas).toHaveLength(3);
        expect(linhas.every(l => l.key_name === 'Chave Lab')).toBe(true);
    });

    it('cruza portador e chave', () => {
        const linhas = rodar({ userId: String(ANA), keyId: '90' });
        expect(linhas).toHaveLength(2);
    });

    it('isola um tipo de movimentação', () => {
        expect(rodar({ action: 'transfer' })).toHaveLength(1);
        expect(rodar({ action: 'withdraw' })).toHaveLength(3);
    });

    it('a contagem acompanha o filtro, para a paginação não mentir', () => {
        const q = buildHistoryQuery({ userId: String(ANA) });
        const { total } = db.prepare(q.countSql).get(...q.countParams) as { total: number };
        expect(total).toBe(3);
    });
});
