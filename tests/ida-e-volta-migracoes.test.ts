import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './pg-test-config';
import { prepararBasePlataforma } from './base-plataforma-pg';

// TASK-106 (CR Tipo D · ADR-022) — todo DOWN é EXECUTADO, e tem de devolver o banco
// exatamente como estava antes do UP.
//
// ## Por que existe
//
// Até 2026-09-10 nenhum dos 10 `.down.sql` tinha rodado uma vez sequer. As guardas
// conferiam que o arquivo existe e o que ele diz — e a §4.2 afirmava "UP + DOWN
// testados". Um DOWN que não restaura é descoberto no pior dia possível: durante a
// reversão de um incidente, em produção.
//
// ## Por que a base de teste precisa dos privilégios de PRODUÇÃO
//
// A primeira ida e volta, feita à mão para o ADR-022, acusou o DOWN da
// `imutabilidade_historico` em 81 linhas. O DOWN estava certo: ele devolve os grants
// que o Supabase dá por padrão a `anon`/`authenticated` em toda tabela nova de
// `public`. Quem estava errada era a base de teste — `pg_default_acl` VAZIO, um banco
// que não existe em lugar nenhum. E com ela a suíte inteira validava permissões
// imaginárias: `anon` sem grant nenhum, então "anon não lê" passava trivialmente.
//
// O valor abaixo não é suposto: foi lido do `pg_default_acl` de produção em
// 2026-09-10 (linha `postgres | public`). As outras linhas daquela consulta são de
// schemas da plataforma (`auth`, `storage`, `graphql`…), onde as migrations não tocam.

const PRODUCAO_2026_09_10 = {
    r: ['anon=arwdDxtm', 'authenticated=arwdDxtm', 'service_role=arwdDxtm'],  // tabelas
    S: ['anon=rwU', 'authenticated=rwU', 'service_role=rwU'],                 // sequências
    f: ['anon=X', 'authenticated=X', 'service_role=X'],                       // funções
};

const BASE = 'ida_volta_teste';
const urlBase = TEST_DATABASE_URL.replace(/\/[^/]+$/, `/${BASE}`);
const urlAdmin = TEST_DATABASE_URL.replace(/\/[^/]+$/, '/postgres');

async function comCliente<T>(url: string, f: (c: Client) => Promise<T>): Promise<T> {
    const c = new Client({ connectionString: url });
    await c.connect();
    try { return await f(c); } finally { await c.end(); }
}

/**
 * O schema `public` como TEXTO comparável: colunas, restrições, índices, triggers,
 * funções, RLS, políticas e privilégios. É o que um DOWN tem de restaurar.
 *
 * Privilégio entra ORDENADO item a item: `{a,b}` e `{b,a}` são o mesmo acesso, e a
 * ordem do array muda com a sequência de GRANT/REVOKE — comparar o array cru acusaria
 * divergência onde não há.
 */
async function retrato(c: Client): Promise<string[]> {
    const acl = (col: string) => `coalesce((SELECT string_agg(x::text, ',' ORDER BY x::text) FROM unnest(${col}) x), 'padrao')`;
    const r = await c.query<{ linha: string }>(`
        SELECT 'coluna ' || table_name || '.' || column_name || ' ' || data_type
               || ' null=' || is_nullable || ' default=' || coalesce(column_default, '') AS linha
          FROM information_schema.columns WHERE table_schema = 'public'
        UNION ALL
        SELECT 'restricao ' || conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
          FROM pg_constraint WHERE connamespace = 'public'::regnamespace
        UNION ALL
        SELECT 'indice ' || indexdef FROM pg_indexes WHERE schemaname = 'public'
        UNION ALL
        SELECT 'trigger ' || pg_get_triggerdef(g.oid)
          FROM pg_trigger g JOIN pg_class k ON k.oid = g.tgrelid
         WHERE NOT g.tgisinternal AND k.relnamespace = 'public'::regnamespace
        UNION ALL
        SELECT 'funcao ' || p.oid::regprocedure || ' ' || md5(pg_get_functiondef(p.oid)) || ' acl=' || ${acl('p.proacl')}
          FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        UNION ALL
        SELECT 'relacao ' || relname || ' ' || relkind::text || ' rls=' || relrowsecurity
               || ' force=' || relforcerowsecurity || ' acl=' || ${acl('relacl')}
          FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'S', 'v', 'm', 'p')
        UNION ALL
        SELECT 'politica ' || tablename || ' ' || policyname || ' ' || cmd || ' ' || coalesce(qual, '')
          FROM pg_policies WHERE schemaname = 'public'
    `);
    return r.rows.map(l => l.linha).sort();
}

function diferenca(antes: string[], depois: string[]) {
    const a = new Set(antes), d = new Set(depois);
    return [
        ...antes.filter(l => !d.has(l)).map(l => `  − ${l}`),
        ...depois.filter(l => !a.has(l)).map(l => `  + ${l}`),
    ];
}

const runner = () => import('../db/runner-migracoes.mjs');

describe('TASK-106 — a base de teste tem os privilégios de produção', () => {
    it('BDD 1: default privileges de `public` iguais aos lidos em produção', async () => {
        const linhas = await comCliente(TEST_DATABASE_URL, c => c.query<{ tipo: string; acl: string }>(`
            SELECT d.defaclobjtype::text AS tipo,
                   (SELECT string_agg(split_part(x::text, '/', 1), ',' ORDER BY x::text)
                      FROM unnest(d.defaclacl) x) AS acl
              FROM pg_default_acl d
             WHERE d.defaclnamespace = 'public'::regnamespace
               AND d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        `));
        const porTipo = Object.fromEntries(linhas.rows.map(l => [l.tipo, l.acl.split(',')]));

        for (const [tipo, esperados] of Object.entries(PRODUCAO_2026_09_10)) {
            for (const e of esperados) {
                expect(porTipo[tipo] ?? [], `a base de teste não concede ${e} (tipo ${tipo}) como produção concede`)
                    .toContain(e);
            }
        }
    });
});

describe('TASK-106 — todo DOWN roda, e devolve o banco como estava', () => {
    beforeAll(async () => {
        await comCliente(urlAdmin, async c => {
            await c.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
            await c.query(`CREATE DATABASE ${BASE}`);
        });
    });

    afterAll(async () => {
        await comCliente(urlAdmin, c => c.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`));
    });

    it('BDD 2: UP → DOWN → schema idêntico ao de antes do UP → UP de novo, para CADA migration', async () => {
        const { listarMigracoes } = await runner();
        const fs = await import('fs');
        const path = await import('path');
        const dir = path.resolve(process.cwd(), 'db/migrations-pg');
        const migracoes = listarMigracoes(dir);
        expect(migracoes.length, 'nenhuma migration encontrada').toBeGreaterThan(0);

        const falhas: string[] = [];
        await comCliente(urlBase, async c => {
            // Mesma base da suíte: `public` do zero e a plataforma por cima.
            await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
            await prepararBasePlataforma(c);

            for (const m of migracoes) {
                const down = fs.readFileSync(path.join(dir, `${m.nome}.down.sql`), 'utf-8');
                const antes = await retrato(c);
                await c.query(m.conteudo);
                try {
                    await c.query(down);
                } catch (e) {
                    falhas.push(`${m.nome}: o DOWN FALHOU ao rodar — ${(e as Error).message}`);
                    break;
                }
                const depois = await retrato(c);
                const dif = diferenca(antes, depois);
                if (dif.length) falhas.push(`${m.nome}: o DOWN não restaura o estado anterior\n${dif.join('\n')}`);
                // E o UP tem de voltar a aplicar: um DOWN que deixa sobra faz o UP
                // seguinte colidir, e a reversão vira beco sem saída.
                try {
                    await c.query(m.conteudo);
                } catch (e) {
                    falhas.push(`${m.nome}: o UP não reaplica depois do DOWN — ${(e as Error).message}`);
                    break;
                }
            }
        });

        expect(falhas, `\n${falhas.join('\n\n')}\n`).toEqual([]);
    });
});
