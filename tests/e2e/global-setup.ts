import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { prepararBasePlataforma } from '../base-plataforma-pg';
import { E2E_DATABASE_URL } from './e2e-db';
import { E2E_PASSWORD } from './helpers';

// TASK-118 — base Postgres EFÊMERA para a E2E, montada como a da vitest.
//
// Até aqui este arquivo montava um SQLite (`better-sqlite3` + `db/migrations/`) e o
// `webServer` recebia `DB_PATH` — o runtime saiu do SQLite na Sprint 21 e a suíte
// morreu sem ninguém notar. Agora a base é montada pelo MESMO runner que monta a de
// produção (ADR-021), sobre a mesma base de plataforma da vitest: a próxima migration
// chega aqui sem ninguém precisar lembrar dela.
//
// ## Ordem: o webServer sobe ANTES deste setup
//
// No Playwright 1.61 os plugins (o `webServer` é um) sobem antes do `globalSetup`.
// Então o servidor já está no ar, com a URL fixa desta base, quando ela é montada.
// Por isso a base é esvaziada por DROP SCHEMA e não derrubada por DROP DATABASE: o
// pool do servidor pode ter conexão aberta nela, e FORCE a mataria.

function naBase(url: string, base: string): string {
    const u = new URL(url);
    u.pathname = `/${base}`;
    return u.toString();
}

async function garantirBase(url: string): Promise<void> {
    const nome = new URL(url).pathname.slice(1);
    // `postgres` existe em todo cluster — a base E2E ainda pode não existir.
    const admin = new Client({ connectionString: naBase(url, 'postgres') });
    await admin.connect();
    try {
        const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nome]);
        if (!rowCount) await admin.query(`CREATE DATABASE "${nome.replace(/"/g, '""')}"`);
    } finally {
        await admin.end();
    }
}

export default async function globalSetup(): Promise<void> {
    try {
        await garantirBase(E2E_DATABASE_URL);
    } catch (e) {
        const host = new URL(E2E_DATABASE_URL).host;
        throw new Error(`Postgres da E2E indisponível em ${host} (${(e as Error).message}). Suba com: npm run test:db:up`);
    }

    const client = new Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
        // Do zero a cada execução, como a vitest.
        await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
        await prepararBasePlataforma(client);
        const { aplicar } = await import('../../db/runner-migracoes.mjs');
        await aplicar(client);

        const hash = bcrypt.hashSync(E2E_PASSWORD, 10);
        // `onboarding_visto_em` preenchido: conta nova cai no tutorial do Dashboard
        // (TASK-098), que cobre a tela que os fluxos exercitam. Estas contas fazem o
        // papel de quem já usa o sistema.
        const { rows: usuarios } = await client.query<{ id: number; username: string }>(
            `INSERT INTO users (username, password_hash, role, active, full_name, requires_password_change, onboarding_visto_em)
             VALUES ('e2e_admin',    $1, 'ADMIN',    true, 'Admin E2E',      false, now()),
                    ('e2e_porteiro', $1, 'PORTEIRO', true, 'Porteiro E2E',   false, now()),
                    ('e2e_aluno',    $1, 'ALUNO',    true, 'Aluno E2E',      false, now()),
                    ('e2e_aluno2',   $1, 'ALUNO',    true, 'Aluno Dois E2E', false, now())
             RETURNING id, username`,
            [hash],
        );
        const aluno = usuarios.find(u => u.username === 'e2e_aluno')!.id;
        await client.query(
            `INSERT INTO keys (name, room, status, user_id, active) VALUES
                ('Chave E2E',          'Sala 101', 'available', NULL, true),
                -- Em uso pelo Aluno E2E — base do fluxo pull (REQ-027).
                ('Chave Pull E2E',     'Sala 202', 'in_use',    $1,   true),
                -- Em uso pelo Aluno E2E — base da devolução forçada pela portaria (REQ-028).
                ('Chave Devolver E2E', 'Sala 303', 'in_use',    $1,   true)`,
            [aluno],
        );
    } finally {
        await client.end();
    }
}
