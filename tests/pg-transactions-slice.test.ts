import { describe, it, expect, beforeEach, vi } from 'vitest';
import { query, queryOne, execute, withTransaction } from '@/lib/pg';

// TASK-069 fatia (c) (Sprint 21 · Etapa 4 do ADR-012) — o ciclo de vida das
// chaves passa a falar Postgres.
//
// É a fatia mais pesada e a que carrega três dos quatro fluxos críticos do
// spec §4: retirada, devolução e transferência. 24 chamadas em três arquivos.
//
// Escopo corrigido — QUARTA correção pela mesma causa, e a última desta task:
// `[id]/user-confirm/route.ts` SAI para a TASK-070. Das suas 11 chamadas, 7
// estão DENTRO do `db.transaction`: o arquivo não é uma rota que por acaso usa
// transação, ele É a transação da dupla confirmação. Parti-lo entre duas tasks
// seria pior do que movê-lo inteiro.
//
// O padrão já tem nome: as fatias foram desenhadas por PASTA e a conversão só
// admite fronteiras de EXECUÇÃO.
//
// Conversão que este arquivo mede de perto: `lastInsertRowid` some. São 7
// ocorrências, e o id devolvido alimenta o INSERT seguinte em `history` — se
// `RETURNING id` vier errado, a transação e o histórico deixam de se referir um
// ao outro em silêncio, sem nenhum erro.

vi.mock('next/headers', () => ({
    cookies: () => ({ get: vi.fn().mockReturnValue({ value: 'token' }) }),
    headers: () => Promise.resolve(new Headers()),
}));

let sessao: { id: number; role: string; username: string } = { id: 2, role: 'PORTEIRO', username: 'test_porteiro' };
vi.mock('@/lib/session', () => ({
    verifySession: vi.fn().mockImplementation(() => Promise.resolve(sessao)),
}));

const KEY_ID = 910;
const USER_ID = 911;

function post(body: Record<string, unknown>) {
    return new Request('http://localhost/api/transactions', {
        method: 'POST',
        body: JSON.stringify(body),
    }) as never;
}

beforeEach(async () => {
    sessao = { id: 2, role: 'PORTEIRO', username: 'test_porteiro' };
    // O trigger de imutabilidade da TASK-065 bloqueia DELETE em `history` — a
    // limpeza do teste passa pelo MESMO caminho autorizado do REQ-014, com o
    // bypass de escopo transacional. Se um dia isto deixar de ser necessário, e
    // porque a garantia caiu.
    await withTransaction(async (tx) => {
        await tx.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
        await tx.execute('DELETE FROM history WHERE key_id = $1', [KEY_ID]);
    });
    await execute('DELETE FROM key_transactions WHERE key_id = $1', [KEY_ID]);
    await execute('DELETE FROM action_logs WHERE user_id = $1', [USER_ID]);
    await execute('DELETE FROM keys WHERE id = $1', [KEY_ID]);
    await execute('DELETE FROM users WHERE id = $1', [USER_ID]);

    await execute(
        `INSERT INTO users (id, username, full_name, role, active)
         OVERRIDING SYSTEM VALUE VALUES ($1, 'portador_pg', 'Portador Postgres', 'FUNCIONARIO', true)`,
        [USER_ID],
    );
    await execute(
        `INSERT INTO keys (id, name, room, status, active)
         OVERRIDING SYSTEM VALUE VALUES ($1, 'Chave Fatia C', 'Sala PG', 'available', true)`,
        [KEY_ID],
    );
});

describe('TASK-069(c) — retirada grava no Postgres', () => {
    it('a retirada com bypass cria transação, ocupa a chave e registra o histórico', async () => {
        const { POST } = await import('@/app/api/transactions/route');

        const res = await POST(post({
            action: 'withdraw', key_id: KEY_ID, user_id: USER_ID,
            bypassConfirmation: true, justification: 'entrega direta no balcão',
        }));
        expect(res.status, 'a rota ainda está no SQLite').toBe(200);

        const chave = await queryOne<{ status: string; user_id: number }>(
            'SELECT status, user_id FROM keys WHERE id = $1', [KEY_ID],
        );
        expect(chave?.status).toBe('in_use');
        expect(chave?.user_id).toBe(USER_ID);

        const tx = await queryOne<{ id: number; status: string; justification: string }>(
            'SELECT id, status, justification FROM key_transactions WHERE key_id = $1', [KEY_ID],
        );
        expect(tx?.status).toBe('completed');
        expect(tx?.justification).toBe('entrega direta no balcão');
    });

    it('o histórico aponta para a transação criada — RETURNING id no lugar de lastInsertRowid', async () => {
        const { POST } = await import('@/app/api/transactions/route');
        await POST(post({
            action: 'withdraw', key_id: KEY_ID, user_id: USER_ID,
            bypassConfirmation: true, justification: 'x',
        }));

        const tx = await queryOne<{ id: number }>(
            'SELECT id FROM key_transactions WHERE key_id = $1', [KEY_ID],
        );
        const hist = await queryOne<{ transaction_id: number; action: string }>(
            'SELECT transaction_id, action FROM history WHERE key_id = $1', [KEY_ID],
        );

        expect(hist, 'nenhuma linha de histórico').toBeDefined();
        expect(hist?.action).toBe('withdraw');
        expect(
            hist?.transaction_id,
            'o histórico ficou órfão: RETURNING id não devolveu o id da transação',
        ).toBe(tx?.id);
    });

    it('chave desativada é recusada — active é boolean, não 0', async () => {
        await execute('UPDATE keys SET active = false WHERE id = $1', [KEY_ID]);
        const { POST } = await import('@/app/api/transactions/route');

        const res = await POST(post({
            action: 'withdraw', key_id: KEY_ID, user_id: USER_ID, bypassConfirmation: true, justification: 'x',
        }));
        const body = await res.json();

        // `key.active === 0` nunca seria verdade com boolean vindo do Postgres:
        // a guarda passaria batido e a chave desativada seria emprestada.
        expect(res.status, 'a guarda de chave desativada deixou passar').toBe(400);
        expect(body.error).toMatch(/desativada/i);
    });

    it('usuário inativo não pode receber chave', async () => {
        await execute('UPDATE users SET active = false WHERE id = $1', [USER_ID]);
        const { POST } = await import('@/app/api/transactions/route');

        const res = await POST(post({
            action: 'withdraw', key_id: KEY_ID, user_id: USER_ID, bypassConfirmation: true, justification: 'x',
        }));
        expect(res.status).toBe(400);
    });

    it('não abre segunda transação para uma chave que já tem pendente', async () => {
        const { POST } = await import('@/app/api/transactions/route');
        await POST(post({ action: 'withdraw', key_id: KEY_ID, user_id: USER_ID }));

        const res = await POST(post({ action: 'withdraw', key_id: KEY_ID, user_id: USER_ID }));
        expect(res.status).toBe(400);

        const todas = await query('SELECT id FROM key_transactions WHERE key_id = $1', [KEY_ID]);
        expect(todas.length, 'duplicou a transação pendente').toBe(1);
    });
});

describe('TASK-069(c) — devolução grava no Postgres', () => {
    it('a devolução com bypass libera a chave e registra o histórico', async () => {
        const { POST } = await import('@/app/api/transactions/route');
        await POST(post({
            action: 'withdraw', key_id: KEY_ID, user_id: USER_ID, bypassConfirmation: true, justification: 'x',
        }));

        const res = await POST(post({
            action: 'return', key_id: KEY_ID, user_id: USER_ID,
            bypassConfirmation: true, justification: 'devolvida no balcão',
        }));
        expect(res.status).toBe(200);

        const chave = await queryOne<{ status: string; user_id: number | null }>(
            'SELECT status, user_id FROM keys WHERE id = $1', [KEY_ID],
        );
        expect(chave?.status).toBe('available');
        expect(chave?.user_id).toBeNull();

        const devolucao = await queryOne(
            "SELECT id FROM history WHERE key_id = $1 AND action = 'return'", [KEY_ID],
        );
        expect(devolucao).toBeDefined();
    });
});

describe('TASK-069(c) — pendentes e cancelamento', () => {
    it('a lista de pendentes vem do Postgres', async () => {
        const { POST } = await import('@/app/api/transactions/route');
        await POST(post({ action: 'withdraw', key_id: KEY_ID, user_id: USER_ID }));

        const { GET } = await import('@/app/api/transactions/pending/route');
        const res = await GET();
        const body = await res.json();

        // A rota devolve o array direto, sem envelope.
        const daChave = (body as { key_id: number }[]).filter(t => t.key_id === KEY_ID);
        expect(daChave.length, 'a pendente criada no Postgres não apareceu').toBe(1);
    });

    it('o cancelamento marca a transação como cancelada no Postgres', async () => {
        const { POST } = await import('@/app/api/transactions/route');
        await POST(post({ action: 'withdraw', key_id: KEY_ID, user_id: USER_ID }));
        const criada = await queryOne<{ id: number }>(
            'SELECT id FROM key_transactions WHERE key_id = $1', [KEY_ID],
        );

        const { POST: Cancel } = await import('@/app/api/transactions/[id]/cancel/route');
        const res = await Cancel(
            new Request('http://localhost/cancel', { method: 'POST' }) as never,
            { params: Promise.resolve({ id: String(criada!.id) }) } as never,
        );
        expect(res.status).toBe(200);

        const depois = await queryOne<{ status: string; completed_at: Date | null }>(
            'SELECT status, completed_at FROM key_transactions WHERE id = $1', [criada!.id],
        );
        expect(depois?.status).toBe('cancelled');
        expect(depois?.completed_at, 'cancelamento sem carimbo de hora').not.toBeNull();
    });
});
