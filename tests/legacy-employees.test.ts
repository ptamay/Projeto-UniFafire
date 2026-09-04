import { describe, it, expect, vi } from 'vitest';
import { buildHistoryQuery } from '@/lib/history-query';
import * as schemas from '@/lib/schemas';
import { POST as TransactionPOST } from '@/app/api/transactions/route';

// TASK-066 (Sprint 20 · Etapa 3 do ADR-012) — consolidação do legado
// `employees` / `employee_id`.
//
// Levantamento no backup de produção de 2026-07-06: `employees` tem 0 linhas,
// `keys.employee_id` é NULL em 5/5, `history.employee_id` é NULL em 30/30. Nada
// nunca escreveu ali — as três rotas de confirmação passam NULL explicitamente.
// Mesmo assim a coluna era LEFT JOINada a cada consulta do histórico, `keys`
// carregava dois portadores concorrentes e a criação de transação tinha um ramo
// de fallback que nenhuma chamada percorria.
//
// O portador de uma chave é `users.id`, ponto. O schema Postgres já nasceu sem o
// legado (TASK-063); aqui sai o código que ainda o mencionava.
//
// O `keys.db` NÃO recebe migration de DROP: as colunas ficam órfãs e inertes até
// o SQLite ser aposentado na Etapa 7. O plano de reversão do ADR-012 depende de
// `git revert` devolver um sistema funcional, e um DROP em SQLite é a única parte
// que um revert não desfaz. O schema de teste (tests/setup.ts), esse sim, perde as
// colunas — assim qualquer escrita remanescente falha alto em vez de gravar NULL
// em silêncio.

vi.mock('next/headers', () => ({
    cookies: () => ({ get: vi.fn().mockReturnValue({ value: 'mocked_token' }) }),
}));

vi.mock('@/lib/session', () => ({
    verifySession: vi.fn().mockImplementation(() =>
        Promise.resolve({ id: 5, role: 'ALUNO', username: 'test_aluno' }),
    ),
}));

describe('TASK-066 — a consulta do histórico deixa de tocar employees', () => {
    it('BDD 1: nenhum JOIN com employees na consulta montada', () => {
        const { sql } = buildHistoryQuery({});
        expect(sql, 'LEFT JOIN employees remanescente').not.toMatch(/\bemployees\b/i);
        expect(sql, 'employee_id remanescente').not.toMatch(/\bemployee_id\b/i);
    });

    it('BDD 1: o nome do portador continua vindo de users', () => {
        // A coluna do resultado se chama employee_name por herança do legado e é
        // consumida assim pela UI; o que muda é a origem, que passa a ser só users.
        const { sql } = buildHistoryQuery({});
        expect(sql).toMatch(/employee_name/);
        expect(sql).toMatch(/LEFT\s+JOIN\s+users\s+u\s+ON\s+h\.user_id/i);
    });

    it('BDD 1: a consulta filtrada também não reintroduz o legado', () => {
        const { sql } = buildHistoryQuery({ date: '2026-09-01', userId: '5', keyId: '1', action: 'withdraw' });
        expect(sql).not.toMatch(/\bemployees\b|\bemployee_id\b/i);
    });
});

describe('TASK-066 — employee_id sai do contrato da transação', () => {
    it('BDD 2: TransactionSchema não tem mais o campo legado', () => {
        const parsed = schemas.TransactionSchema.parse({
            action: 'withdraw',
            key_id: 1,
            employee_id: 7,
        });
        expect('employee_id' in parsed, 'employee_id ainda faz parte do contrato').toBe(false);
    });

    it('BDD 2: retirada só com employee_id é rejeitada como retirada sem portador', async () => {
        const req = new Request('http://localhost/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'withdraw', key_id: 1, employee_id: 5 }),
        });

        const res = await TransactionPOST(req as never);
        const body = await res.json();

        expect(res.status, 'sem user_id não há portador — 400').toBe(400);
        expect(body.error).toMatch(/usuário/i);
    });

    it('BDD 2: EmployeeSchema, que nunca foi usado, deixa de ser exportado', () => {
        expect('EmployeeSchema' in schemas).toBe(false);
    });
});
