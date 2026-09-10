import { describe, it, expect } from 'vitest';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './pg-test-config';

// TASK-109 (CR Tipo C · ADR-023) — a chave pública do Supabase não alcança nada em
// `public`, hoje e amanhã.
//
// ## O que foi medido, em produção, em 2026-09-10
//
// Consulta só-leitura rodada pelo usuário, idêntica ao que a base de teste mostra
// desde a TASK-106: `anon` e `authenticated` sem privilégio em nenhuma das 12
// tabelas, todas com RLS — mas com `SELECT/UPDATE/USAGE` nas 11 sequências e
// `EXECUTE` nas 4 funções de trigger. Sobra, não falha explorável: a chave do bundle
// não alcança sequência nem chama função de trigger.
//
// ## O que importa é a tabela que ainda não existe
//
// No Supabase, tabela, sequência e função novas em `public` NASCEM concedidas a
// `anon`. As 12 só estão fechadas porque cada migration lembrou o REVOKE. Esta task
// fecha o default — e este teste cobra com objetos criados agora, não com a lista de
// hoje.
//
// ## O RLS da tabela nova, e por que a base de teste é mais rígida que produção
//
// Produção tem o event trigger `ensure_rls` (lido em 2026-09-10), que liga RLS sozinho
// em tabela nova. A base de teste NÃO o reproduz, de propósito: assim o cenário 1
// reprova a migration que esquecer o `ENABLE ROW LEVEL SECURITY`, em vez de a
// segurança do projeto depender de um recurso da plataforma que pode mudar.

async function comCliente<T>(f: (c: Client) => Promise<T>): Promise<T> {
    const c = new Client({ connectionString: TEST_DATABASE_URL });
    await c.connect();
    try { return await f(c); } finally { await c.end(); }
}

const PAPEIS = ['anon', 'authenticated'];

describe('TASK-109 — nada de public para a chave pública', () => {
    it('BDD 1: toda tabela de public tem RLS', async () => {
        const r = await comCliente(c => c.query<{ relname: string }>(`
            SELECT relname FROM pg_class
             WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity`));
        expect(r.rows.map(l => l.relname), 'tabela sem RLS — a migration esqueceu o ENABLE').toEqual([]);
    });

    it('BDD 1: anon e authenticated sem privilégio em tabela, sequência ou função — nem herdado de PUBLIC', async () => {
        // `has_*_privilege` responde pelo acesso EFETIVO, somando o que vem de PUBLIC.
        // Olhar só o ACL da role deixaria passar o EXECUTE que toda função dá a PUBLIC.
        const r = await comCliente(c => c.query<{ achado: string }>(`
            WITH alvo AS (SELECT unnest($1::text[]) AS papel)
            SELECT a.papel || ' → tabela ' || k.relname AS achado FROM pg_class k, alvo a
             WHERE k.relnamespace = 'public'::regnamespace AND k.relkind = 'r'
               AND has_table_privilege(a.papel, k.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            UNION ALL
            SELECT a.papel || ' → sequência ' || k.relname FROM pg_class k, alvo a
             WHERE k.relnamespace = 'public'::regnamespace AND k.relkind = 'S'
               AND has_sequence_privilege(a.papel, k.oid, 'USAGE,SELECT,UPDATE')
            UNION ALL
            SELECT a.papel || ' → função ' || p.proname FROM pg_proc p, alvo a
             WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege(a.papel, p.oid, 'EXECUTE')
            ORDER BY 1`, [PAPEIS]));
        expect(r.rows.map(l => l.achado), 'a chave pública ainda alcança').toEqual([]);
    });
});

describe('TASK-109 — a ida e volta enxerga o que esta migration muda', () => {
    it('BDD 3: o retrato do schema inclui os default privileges', async () => {
        // Esta é a primeira migration que mexe em default privilege. Se o retrato não o
        // incluir, um DOWN que esquecesse de restaurá-lo passaria na ida e volta da
        // TASK-106 — e a regra da §4.2 ficaria verificada só no papel.
        const { retratoDoSchema } = await import('../db/runner-migracoes.mjs');
        const [antes, depois] = await comCliente(async c => {
            await c.query('BEGIN');
            try {
                const a = await retratoDoSchema(c);
                await c.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon');
                return [a, await retratoDoSchema(c)];
            } finally {
                await c.query('ROLLBACK');
            }
        });
        expect(depois, 'o retrato não mudou quando o default privilege mudou').not.toEqual(antes);
    });
});

describe('TASK-109 — o que for criado depois nasce fechado', () => {
    it('BDD 2: tabela, sequência e função NOVAS não são concedidas à chave pública', async () => {
        // Com objetos criados AGORA, como uma migration futura os criaria — e desfeitos
        // no fim. É o cenário que a lista de hoje não alcança.
        const achados = await comCliente(async c => {
            await c.query('BEGIN');
            try {
                await c.query('CREATE TABLE guarda_tabela_nova (id serial PRIMARY KEY)');
                await c.query('CREATE FUNCTION guarda_funcao_nova() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$');
                const r = await c.query<{ achado: string }>(`
                    WITH alvo AS (SELECT unnest($1::text[]) AS papel)
                    SELECT a.papel || ' → tabela nova' AS achado FROM alvo a
                     WHERE has_table_privilege(a.papel, 'public.guarda_tabela_nova', 'SELECT,INSERT,UPDATE,DELETE')
                    UNION ALL
                    SELECT a.papel || ' → sequência nova' FROM alvo a
                     WHERE has_sequence_privilege(a.papel, 'public.guarda_tabela_nova_id_seq', 'USAGE,SELECT,UPDATE')
                    UNION ALL
                    SELECT a.papel || ' → função nova' FROM alvo a
                     WHERE has_function_privilege(a.papel, 'public.guarda_funcao_nova()', 'EXECUTE')`, [PAPEIS]);
                return r.rows.map(l => l.achado);
            } finally {
                await c.query('ROLLBACK');
            }
        });
        expect(achados, 'objeto novo nasce aberto à chave do bundle — o default não foi fechado').toEqual([]);
    });
});
