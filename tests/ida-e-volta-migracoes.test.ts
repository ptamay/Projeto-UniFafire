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

// O retrato do schema mora no runner (`retratoDoSchema`): o ensaio sobre a cópia de
// produção (TASK-107) compara a mesma coisa, e duas definições divergiriam.
const runner = () => import('../db/runner-migracoes.mjs');

describe('TASK-106 — a base de teste tem os privilégios de produção', () => {
    it('BDD 1: default privileges de `public` iguais aos lidos em produção', async () => {
        // Numa base recém-preparada, ANTES das migrations: o que se compara é o padrão
        // da PLATAFORMA. A primeira versão lia a base da suíte depois das migrations —
        // e a `202609101600_api_de_dados_fechada` (TASK-109) revoga exatamente esse
        // default, de propósito. O cenário passaria a medir a migration, não a base.
        const PLATAFORMA = 'plataforma_teste';
        await comCliente(urlAdmin, async c => {
            await c.query(`DROP DATABASE IF EXISTS ${PLATAFORMA} WITH (FORCE)`);
            await c.query(`CREATE DATABASE ${PLATAFORMA}`);
        });
        const linhas = await comCliente(TEST_DATABASE_URL.replace(/\/[^/]+$/, `/${PLATAFORMA}`), async c => {
            await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
            await prepararBasePlataforma(c);
            return c.query<{ tipo: string; acl: string }>(`
                SELECT d.defaclobjtype::text AS tipo,
                       (SELECT string_agg(split_part(x::text, '/', 1), ',' ORDER BY x::text)
                          FROM unnest(d.defaclacl) x) AS acl
                  FROM pg_default_acl d
                 WHERE d.defaclnamespace = 'public'::regnamespace
                   AND d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
            `);
        });
        await comCliente(urlAdmin, c => c.query(`DROP DATABASE IF EXISTS ${PLATAFORMA} WITH (FORCE)`));
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
        const { listarMigracoes, retratoDoSchema: retrato, diferencaDeRetratos: diferenca } = await runner();
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
