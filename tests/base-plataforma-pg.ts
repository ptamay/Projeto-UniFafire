import type { Client } from 'pg';

// O que a PLATAFORMA Supabase fornece e um Postgres puro não tem — preparado numa
// base com o schema `public` recém-criado, antes das migrations.
//
// Extraído do `global-setup-pg.ts` para ter UMA definição: a suíte monta a base dela
// com isto, e a ida e volta das migrations (ADR-022) monta bases descartáveis com
// isto. Duas cópias divergiriam no primeiro dia em que alguém mexesse numa só — e o
// teste passaria a validar um banco que não existe em lugar nenhum.

export async function prepararBasePlataforma(client: Client): Promise<void> {
    // Os papéis `anon` e `authenticated` e a função do event trigger
    // `rls_auto_enable` existem lá e não num Postgres puro. A migration da TASK-065
    // revoga privilégios dos três — e a alternativa seria torná-la tolerante à
    // ausência deles, o que faria o teste rodar uma migration DIFERENTE da que foi
    // aplicada em produção. Fornecer a base aqui mantém as duas idênticas.
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
}
