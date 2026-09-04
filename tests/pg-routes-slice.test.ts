import { describe, it, expect, beforeEach, vi } from 'vitest';
import { queryOne, execute, withTransaction } from '@/lib/pg';

// TASK-069 fatia (d) (Sprint 21 · Etapa 4 do ADR-012) — as demais rotas de API.
//
// Seis arquivos, 28 chamadas. É a fatia que carrega as DUAS conversões de
// dialeto que o oráculo (docs/migracao-dialeto-sql.md) marcou como de
// julgamento, e nenhuma das duas é mecânica:
//
// 1. `json_object` → `json_build_object`. No SQLite o retorno é TEXTO, e por
//    isso a rota de chaves faz `JSON.parse`. No Postgres o tipo é `json` e o
//    driver já entrega o objeto pronto: manter o `JSON.parse` quebraria. O
//    caminho errado aqui seria forçar `::text` para preservar o `JSON.parse` —
//    isso conservaria, na stack nova, uma volta que só existia por limitação da
//    antiga.
//
// 2. `strftime('%H', ...)` → `to_char(... , 'HH24')`. O fuso NÃO se move para o
//    SQL: `localHourToUtcHour` (TASK-055) já converte a hora do operador para
//    UTC em JS, e a comparação no banco é entre horas UTC. Mover a conversão
//    para o SQL seria reescrever a correção da TASK-055 sem necessidade, com o
//    risco de reintroduzir o defeito que ela fechou.
//
// Ficam de fora, para a TASK-070: `history/clear`, `settings/clear-database` e
// `settings/route` — os três dependem de `db-maintenance` ou de transação.

vi.mock('next/headers', () => ({
    cookies: () => ({ get: vi.fn().mockReturnValue({ value: 'token' }) }),
    headers: () => Promise.resolve(new Headers()),
}));

let sessao: { id: number; role: string; username: string } = { id: 1, role: 'ADMIN', username: 'test_admin' };
vi.mock('@/lib/session', () => ({
    verifySession: vi.fn().mockImplementation(() => Promise.resolve(sessao)),
}));

const KEY_ID = 920;
const USER_ID = 921;

beforeEach(async () => {
    sessao = { id: 1, role: 'ADMIN', username: 'test_admin' };
    await withTransaction(async (t) => {
        await t.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
        await t.execute('DELETE FROM history WHERE key_id = $1', [KEY_ID]);
    });
    await execute('DELETE FROM key_transactions WHERE key_id = $1', [KEY_ID]);
    await execute('DELETE FROM action_logs WHERE user_id >= 920');
    await execute('DELETE FROM keys WHERE id = $1 OR name LIKE $2', [KEY_ID, 'Chave Fatia D%']);
    await execute('DELETE FROM users WHERE id = $1 OR username LIKE $2', [USER_ID, 'fatia_d%']);

    await execute(
        `INSERT INTO users (id, username, full_name, role, active)
         OVERRIDING SYSTEM VALUE VALUES ($1, 'fatia_d_portador', 'Portador D', 'FUNCIONARIO', true)`,
        [USER_ID],
    );
    await execute(
        `INSERT INTO keys (id, name, room, status, active)
         OVERRIDING SYSTEM VALUE VALUES ($1, 'Chave Fatia D', 'Sala D', 'available', true)`,
        [KEY_ID],
    );
});

describe('TASK-069(d) — rota de chaves e o json_build_object', () => {
    it('lista as chaves ativas do Postgres', async () => {
        const { GET } = await import('@/app/api/keys/route');
        const res = await GET();
        const body = await res.json() as { id: number; name: string }[];

        expect(res.status, 'a rota ainda está no SQLite').toBe(200);
        expect(body.some(k => k.id === KEY_ID), 'a chave semeada no Postgres não apareceu').toBe(true);
    });

    it('a chave desativada não aparece — active é boolean', async () => {
        await execute('UPDATE keys SET active = false WHERE id = $1', [KEY_ID]);
        const { GET } = await import('@/app/api/keys/route');
        const body = await (await GET()).json() as { id: number }[];

        expect(body.some(k => k.id === KEY_ID), 'chave desativada vazou para a lista').toBe(false);
    });

    it('pending_info vem como OBJETO do driver, sem JSON.parse', async () => {
        const tx = await queryOne<{ id: number }>(
            `INSERT INTO key_transactions (key_id, user_id, action, status, initiated_at)
             VALUES ($1, $2, 'withdraw', 'pending', now()) RETURNING id`,
            [KEY_ID, USER_ID],
        );

        const { GET } = await import('@/app/api/keys/route');
        const body = await (await GET()).json() as { id: number; pending_info: { transaction_id: number; action: string } | null }[];
        const chave = body.find(k => k.id === KEY_ID);

        expect(chave?.pending_info, 'pending_info não foi montado').not.toBeNull();
        expect(chave?.pending_info?.transaction_id).toBe(tx!.id);
        expect(chave?.pending_info?.action).toBe('withdraw');
    });

    it('cria a chave no Postgres e devolve o id — RETURNING id', async () => {
        const { POST } = await import('@/app/api/keys/route');
        const res = await POST(new Request('http://localhost/api/keys', {
            method: 'POST', body: JSON.stringify({ name: 'Chave Fatia D Nova', room: 'Sala N' }),
        }) as never);
        const body = await res.json() as { id: number };

        expect(res.status).toBe(200);
        expect(typeof body.id, 'o id criado não voltou').toBe('number');

        const gravada = await queryOne<{ name: string }>('SELECT name FROM keys WHERE id = $1', [body.id]);
        expect(gravada?.name).toBe('Chave Fatia D Nova');
    });
});

describe('TASK-069(d) — rota de usuários', () => {
    it('lista apenas usuários ativos do Postgres', async () => {
        const { GET } = await import('@/app/api/users/route');
        const body = await (await GET()).json() as { id: number }[];
        expect(body.some(u => u.id === USER_ID)).toBe(true);

        await execute('UPDATE users SET active = false WHERE id = $1', [USER_ID]);
        const depois = await (await GET()).json() as { id: number }[];
        expect(depois.some(u => u.id === USER_ID), 'usuário inativo vazou para a lista').toBe(false);
    });

    it('a troca de papel grava no Postgres', async () => {
        const { POST } = await import('@/app/api/users/role/route');
        const res = await POST(new Request('http://localhost/api/users/role', {
            method: 'POST', body: JSON.stringify({ userId: USER_ID, role: 'GESTOR' }),
        }) as never);

        expect(res.status).toBe(200);
        const linha = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [USER_ID]);
        expect(linha?.role).toBe('GESTOR');
    });
});

describe('TASK-069(d) — filtro de hora dos logs (to_char no lugar de strftime)', () => {
    it('filtra pela hora do operador, com a conversão de fuso preservada em JS', async () => {
        // Instante conhecido: 2026-03-10 18:30 UTC. Em America/Recife (UTC-3),
        // 15:30 local — é essa hora que o operador digita no filtro.
        await execute(
            `INSERT INTO action_logs (user_id, username, action, target, timestamp)
             VALUES ($1, 'fatia_d_portador', 'ACAO_HORA', 'alvo', $2)`,
            [USER_ID, '2026-03-10T18:30:00.000Z'],
        );

        const { GET } = await import('@/app/api/logs/route');

        const casa = await (await GET(
            new Request('http://localhost/api/logs?hour=15') as never,
        )).json() as { logs: { action: string }[] };
        expect(
            casa.logs.some(l => l.action === 'ACAO_HORA'),
            'a hora local do operador deixou de casar — a conversão de fuso da TASK-055 se perdeu',
        ).toBe(true);

        const naoCasa = await (await GET(
            new Request('http://localhost/api/logs?hour=18') as never,
        )).json() as { logs: { action: string }[] };
        expect(
            naoCasa.logs.some(l => l.action === 'ACAO_HORA'),
            'casou com a hora UTC crua: o filtro voltou a ignorar o fuso',
        ).toBe(false);
    });

    it('a contagem total e a paginação vêm do Postgres', async () => {
        const { GET } = await import('@/app/api/logs/route');
        const body = await (await GET(
            new Request('http://localhost/api/logs?limit=5') as never,
        )).json() as { total: number; totalPages: number; logs: unknown[] };

        expect(typeof body.total, 'total precisa ser número, não a string do count(*)').toBe('number');
        expect(body.logs.length).toBeLessThanOrEqual(5);
    });
});

describe('TASK-069(d) — métricas de chaves e usuários frequentes', () => {
    it('as chaves frequentes saem do histórico no Postgres', async () => {
        await execute(
            `INSERT INTO history (key_id, user_id, username, action, timestamp)
             VALUES ($1, $2, 'fatia_d_portador', 'withdraw', now())`,
            [KEY_ID, USER_ID],
        );

        const { GET } = await import('@/app/api/metrics/frequent-keys/route');
        const body = await (await GET(new Request('http://localhost/api/metrics/frequent-keys') as never)).json();

        const lista = (Array.isArray(body) ? body : body.keys) as { id: number }[];
        expect(lista.some(k => k.id === KEY_ID), 'a retirada gravada no Postgres não contou').toBe(true);
    });
});
