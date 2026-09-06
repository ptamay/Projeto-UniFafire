import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { queryOne, execute } from '@/lib/pg';

// TASK-069 fatia (b) (Sprint 21 · Etapa 4 do ADR-012) — autenticação e conta
// passam a falar Postgres.
//
// Mesma medida da fatia (a): o que prova a conversão não é o `await`, é ONDE O
// DADO VIVE. Cada usuário abaixo é semeado SÓ no Postgres — se a rota ainda
// consultasse o SQLite, não o encontraria e o teste falharia.
//
// Esta é a fatia do fluxo crítico nº 1 do spec §4. Os dois erros que importam
// aqui são opostos e igualmente graves: recusar quem devia entrar (sistema
// trancado) e aceitar quem não devia (sessão indevida). Os dois têm cenário.

vi.mock('next/headers', () => ({
    cookies: () => ({
        get: vi.fn().mockReturnValue({ value: 'token-de-teste' }),
        set: vi.fn(),
    }),
    headers: () => Promise.resolve(new Headers()),
}));

const SENHA = 'senha-da-fatia-b';
let hash: string;

async function semearNoPostgres(
    id: number,
    username: string,
    opts: { active?: boolean; precisaTrocar?: boolean } = {},
) {
    await execute(
        `INSERT INTO users (id, username, password_hash, role, active, requires_password_change)
         OVERRIDING SYSTEM VALUE VALUES ($1, $2, $3, 'FUNCIONARIO', $4, $5)
         ON CONFLICT (id) DO UPDATE
            SET password_hash = excluded.password_hash,
                active = excluded.active,
                requires_password_change = excluded.requires_password_change`,
        [id, username, hash, opts.active ?? true, opts.precisaTrocar ?? false],
    );
}

function login(body: Record<string, unknown>) {
    return new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
    }) as never;
}

beforeEach(async () => {
    hash = await bcrypt.hash(SENHA, 10);
    await execute('DELETE FROM login_attempts');
    await execute('DELETE FROM rate_limit_hits');
    // action_logs ANTES de users: o Postgres impõe a chave estrangeira que o
    // SQLite deixava passar. Não é atrito do teste — é a integridade que a
    // migração compra, aparecendo na primeira vez que alguém a exercita.
    await execute('DELETE FROM action_logs WHERE user_id >= 800');
    await execute('DELETE FROM users WHERE id >= 800');
});

describe('TASK-069(b) — login autentica contra o Postgres', () => {
    it('aceita usuário que existe SÓ no Postgres', async () => {
        await semearNoPostgres(801, 'so_pg_login');
        const { POST } = await import('@/app/api/auth/login/route');

        const res = await POST(login({ username: 'so_pg_login', password: SENHA }));

        expect(res.status, 'a rota ainda está consultando o SQLite').toBe(200);
    });

    it('recusa quem está inativo no Postgres, sem revelar que existe', async () => {
        await semearNoPostgres(802, 'inativo_pg_login', { active: false });
        const { POST } = await import('@/app/api/auth/login/route');

        const res = await POST(login({ username: 'inativo_pg_login', password: SENHA }));
        const body = await res.json();

        expect(res.status).toBe(401);
        // REQ-001: a mensagem é a mesma de senha errada — inativo não pode ser
        // distinguível de inexistente.
        expect(body.error).toBe('Credenciais inválidas');
    });

    it('recusa senha errada de usuário que existe no Postgres', async () => {
        await semearNoPostgres(803, 'senha_errada_pg');
        const { POST } = await import('@/app/api/auth/login/route');

        const res = await POST(login({ username: 'senha_errada_pg', password: 'nao-e-essa' }));
        expect(res.status).toBe(401);
    });

    it('a tentativa falha é registrada no Postgres', async () => {
        await semearNoPostgres(804, 'registra_falha_pg');
        const { POST } = await import('@/app/api/auth/login/route');

        await POST(login({ username: 'registra_falha_pg', password: 'errada' }));

        const tentativa = await queryOne<{ success: boolean }>(
            'SELECT success FROM login_attempts WHERE username = $1', ['registra_falha_pg'],
        );
        expect(tentativa?.success).toBe(false);
    });
});

describe('TASK-069(b) — troca de senha obrigatória grava no Postgres', () => {
    it('requires_password_change é boolean, e a troca no primeiro login o zera', async () => {
        await semearNoPostgres(805, 'primeiro_login_pg', { precisaTrocar: true });
        const { POST } = await import('@/app/api/auth/login/route');

        // Sem a nova senha: 403 pedindo a troca.
        const semNova = await POST(login({ username: 'primeiro_login_pg', password: SENHA }));
        expect((await semNova.json()).error).toBe('REQUIRE_PASSWORD_CHANGE');

        const res = await POST(login({
            username: 'primeiro_login_pg', password: SENHA, newPassword: 'senha-nova-12345',
        }));
        expect(res.status).toBe(200);

        const linha = await queryOne<{ requires_password_change: boolean; password_hash: string }>(
            'SELECT requires_password_change, password_hash FROM users WHERE id = $1', [805],
        );
        expect(linha?.requires_password_change, 'a flag tem de ser boolean false, não 0').toBe(false);
        await expect(bcrypt.compare('senha-nova-12345', linha!.password_hash)).resolves.toBe(true);
    });
});

describe('TASK-069(b) — rotas de conta gravam no Postgres', () => {
    it('a troca de senha pela página de segurança atualiza o hash no Postgres', async () => {
        await semearNoPostgres(806, 'troca_seguranca_pg');
        // A rota usa verifySession (não verifySessionEdge): mockar o módulo
        // errado deixaria o teste passar por 401 sem nunca tocar a consulta.
        vi.doMock('@/lib/session', async (orig) => ({
            ...(await orig<Record<string, unknown>>()),
            verifySession: () => Promise.resolve({ id: 806, username: 'troca_seguranca_pg', role: 'FUNCIONARIO' }),
        }));
        vi.resetModules();

        const { PUT } = await import("@/app/api/account/security/password/route");
        const res = await PUT(new Request("http://localhost/api/account/security/password", {
            method: 'POST',
            body: JSON.stringify({ currentPassword: SENHA, newPassword: 'outra-senha-999' }),
        }) as never);

        expect(res.status).toBe(200);
        const linha = await queryOne<{ password_hash: string }>(
            'SELECT password_hash FROM users WHERE id = $1', [806],
        );
        await expect(bcrypt.compare('outra-senha-999', linha!.password_hash)).resolves.toBe(true);
    });

    it('o reset lê a senha padrão de settings no Postgres e marca a troca obrigatória', async () => {
        await semearNoPostgres(807, 'alvo_do_reset_pg');
        await execute(
            `INSERT INTO settings (key, value) VALUES ('default_reset_password', 'padrao-do-postgres')
             ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        );

        vi.doMock('@/lib/session', async (orig) => ({
            ...(await orig<Record<string, unknown>>()),
            verifySession: () => Promise.resolve({ id: 1, username: 'test_admin', role: 'ADMIN' }),
        }));
        vi.resetModules();

        const { POST } = await import('@/app/api/users/reset-password/route');
        const res = await POST(new Request('http://localhost/api/users/reset-password', {
            method: 'POST',
            body: JSON.stringify({ userId: 807 }),
        }) as never);

        expect(res.status).toBe(200);
        const linha = await queryOne<{ password_hash: string; requires_password_change: boolean }>(
            'SELECT password_hash, requires_password_change FROM users WHERE id = $1', [807],
        );
        expect(linha?.requires_password_change).toBe(true);
        await expect(
            bcrypt.compare('padrao-do-postgres', linha!.password_hash),
        ).resolves.toBe(true);
    });
});
