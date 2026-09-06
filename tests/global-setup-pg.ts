import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './pg-test-config';

// TASK-068 (Sprint 21 · decisão D1) — prepara o Postgres de teste antes da suíte.
//
// Aplica as migrations REAIS de db/migrations-pg/. Escrever um schema paralelo
// aqui seria mais rápido e mais errado: se ele divergir das migrations, a suíte
// passa a validar contra um banco que não existe em lugar nenhum — nem em
// produção, nem no Supabase.

const MIGRATIONS_PG = path.resolve(process.cwd(), 'db', 'migrations-pg');

const AJUDA = `
┌─ Postgres de teste indisponível ─────────────────────────────────────────────┐
│                                                                              │
│  A suíte roda contra Postgres real em container (decisão D1 da Sprint 21).   │
│                                                                              │
│    1. Abra o Docker Desktop e espere o daemon subir                          │
│    2. npm run test:db:up                                                     │
│                                                                              │
│  Para derrubar depois:  npm run test:db:down                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
`;

function dockerEstaNoAr(): boolean {
    try {
        execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
            stdio: 'pipe',
            timeout: 20_000,
        });
        return true;
    } catch {
        return false;
    }
}

async function esperarBanco(url: string, tentativas = 30): Promise<void> {
    for (let i = 0; i < tentativas; i++) {
        const client = new Client({ connectionString: url });
        try {
            await client.connect();
            await client.end();
            return;
        } catch {
            await client.end().catch(() => {});
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error('banco não respondeu a tempo');
}

export async function setup(): Promise<void> {
    const url = TEST_DATABASE_URL;

    // Distinguir "Docker parado" de "banco fora" importa: são consertos
    // diferentes, e um ECONNREFUSED cru não diz qual dos dois é.
    if (!dockerEstaNoAr()) {
        throw new Error(`O daemon do Docker não está rodando.\n${AJUDA}`);
    }

    try {
        await esperarBanco(url);
    } catch {
        throw new Error(`Docker está no ar, mas o container do Postgres não.\n${AJUDA}`);
    }

    const client = new Client({ connectionString: url });
    await client.connect();
    try {
        // Do zero a cada execução: schema de teste não acumula estado entre runs,
        // e assim uma migration recém-escrita é exercitada de verdade.
        await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

        // Base da PLATAFORMA Supabase, não do nosso schema: os papéis `anon` e
        // `authenticated` e a função do event trigger `rls_auto_enable` existem lá
        // e não num Postgres puro. A migration da TASK-065 revoga privilégios dos
        // três — e a alternativa seria torná-la tolerante à ausência deles, o que
        // faria o teste rodar uma migration DIFERENTE da que foi aplicada em
        // produção. Fornecer a base aqui mantém as duas idênticas.
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    CREATE ROLE anon NOLOGIN;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    CREATE ROLE authenticated NOLOGIN;
                END IF;
            END $$;

            CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger
            LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
            AS $$ BEGIN END $$;
        `);

        // TASK-072 — o schema `realtime` e a funcao `send` sao da PLATAFORMA
        // Supabase, e nao existem num postgres:17 puro. Mesma razao dos papeis
        // acima: sem eles, a migration do sinal rodaria DIFERENTE aqui e em
        // producao, e o teste validaria um banco que nao existe em lugar nenhum.
        //
        // A assinatura abaixo e a REAL, conferida no projeto de producao em
        // 2026-09-06: `send(payload jsonb, event text, topic text, private
        // boolean)`. Se ela divergir, o trigger falha em producao e passa aqui —
        // exatamente o tipo de cegueira que fez o job de backup falhar tres vezes
        // na Sprint 23.
        //
        // O stub REGISTRA em vez de descartar: e o que permite afirmar, em teste,
        // que o sinal foi emitido uma vez por instrucao e que a carga esta vazia.
        await client.query(`
            -- Derrubado junto com o public, e pelo mesmo motivo: do zero a cada
            -- execucao. Sem isto, a segunda rodada colide em 42P07 (relacao ja
            -- existe) — o globalSetup limpava o public e deixava este de pe.
            DROP SCHEMA IF EXISTS realtime CASCADE;
            CREATE SCHEMA realtime;

            -- No schema realtime, e NAO em public: uma tabela de teste em
            -- public entra na contagem do que a aplicacao possui, e a
            -- verificacao de backup (TABELAS_ESPERADAS) passou a acusar
            -- divergencia de schema. Foi um teste existente que pegou.
            CREATE TABLE realtime.sinais_enviados (
                id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                enviado_em timestamptz NOT NULL DEFAULT now(),
                payload jsonb,
                event text,
                topic text,
                private boolean
            );

            CREATE OR REPLACE FUNCTION realtime.send(
                payload jsonb, event text, topic text, private boolean
            ) RETURNS void
            LANGUAGE plpgsql
            AS $$
            BEGIN
                INSERT INTO realtime.sinais_enviados (payload, event, topic, private)
                VALUES (payload, event, topic, private);
            END;
            $$;
        `);

        const ups = fs.readdirSync(MIGRATIONS_PG).filter(f => f.endsWith('.up.sql')).sort();
        if (ups.length === 0) throw new Error(`nenhuma migration encontrada em ${MIGRATIONS_PG}`);

        for (const arquivo of ups) {
            const sql = fs.readFileSync(path.join(MIGRATIONS_PG, arquivo), 'utf-8');
            try {
                await client.query(sql);
            } catch (e) {
                throw new Error(`falha aplicando ${arquivo}: ${(e as Error).message}`);
            }
        }

        // As migrations revogam de `anon`/`authenticated` (TASK-065). Esses papéis
        // são do Supabase e não existem no container; a migration precisa criá-los
        // ou tolerar a ausência — se este ponto for atingido, ela não fez nem um
        // nem outro.
        const tabelas = await client.query(
            `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
        );
        if (tabelas.rows[0].n < 9) {
            throw new Error(`schema incompleto: ${tabelas.rows[0].n} tabelas, esperadas 9`);
        }
    } finally {
        await client.end();
    }
}
