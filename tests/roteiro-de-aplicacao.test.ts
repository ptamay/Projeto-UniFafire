import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './pg-test-config';

// TASK-109 (ADR-023) — aplicar em produção pelo EDITOR SQL do Supabase sem aplicar
// por fora do runner.
//
// ## Por que existe
//
// A §4.1 (emendada em 2026-09-10) manda: "a aplicação é feita pelo runner do projeto,
// que registra o que aplicou em `migracoes_aplicadas` na mesma transação". O
// mantenedor prefere o editor SQL do Supabase a pôr a URL de produção num terminal. Colar
// o `.up.sql` no editor aplicaria SEM registrar — exatamente como o ledger do Supabase
// divergiu cinco vezes em três dias (ADR-021).
//
// O runner passa a GERAR o roteiro: uma transação que confere o que o `aplicar`
// conferiria, aplica o UP e grava o registro com o checksum canônico. O editor só
// executa o que o runner escreveu.

const BASE = 'roteiro_teste';
const urlBase = TEST_DATABASE_URL.replace(/\/[^/]+$/, `/${BASE}`);
const urlAdmin = TEST_DATABASE_URL.replace(/\/[^/]+$/, '/postgres');
let dir: string;

async function comCliente<T>(url: string, f: (c: Client) => Promise<T>): Promise<T> {
    const c = new Client({ connectionString: url });
    await c.connect();
    try { return await f(c); } finally { await c.end(); }
}

function escrever(nome: string, up: string) {
    fs.writeFileSync(path.join(dir, `${nome}.up.sql`), up);
    fs.writeFileSync(path.join(dir, `${nome}.down.sql`), '-- down');
}

const runner = () => import('../db/runner-migracoes.mjs');

beforeEach(async () => {
    await comCliente(urlAdmin, async c => {
        await c.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
        await c.query(`CREATE DATABASE ${BASE}`);
    });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roteiro-'));
    escrever('202601010000_a', 'CREATE TABLE a (id int);');
    const { aplicar } = await runner();
    await comCliente(urlBase, c => aplicar(c, dir));
});

afterAll(async () => {
    await comCliente(urlAdmin, c => c.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`));
});

describe('TASK-109 — o roteiro faz o que o `aplicar` faria', () => {
    it('BDD 1: aplica e registra, com o checksum canônico — e o `conferir` sai limpo', async () => {
        escrever('202601020000_b', 'CREATE TABLE b (id int);');
        const { roteiroDeAplicacao, conferir, listarMigracoes, TABELA_REGISTRO } = await runner();

        await comCliente(urlBase, c => c.query(roteiroDeAplicacao(dir, '202601020000_b')));

        const linha = await comCliente(urlBase, c =>
            c.query(`SELECT checksum, modo FROM ${TABELA_REGISTRO} WHERE nome = '202601020000_b'`));
        const esperado = listarMigracoes(dir).find(m => m.nome === '202601020000_b')!.checksum;
        expect(linha.rows[0], 'aplicou sem registrar — o ledger do Supabase de novo').toEqual({ checksum: esperado, modo: 'aplicada' });

        const r = await comCliente(urlBase, c => conferir(c, dir));
        expect({ p: r.pendentes, a: r.alteradas, o: r.orfas }).toEqual({ p: [], a: [], o: [] });
    });

    it('BDD 2: rodado de novo, recusa — e não mexe em nada', async () => {
        // Colar duas vezes no editor é o erro mais provável de todos.
        escrever('202601020000_b', 'CREATE TABLE b (id int); INSERT INTO a VALUES (1);');
        const { roteiroDeAplicacao } = await runner();
        const roteiro = roteiroDeAplicacao(dir, '202601020000_b');

        await comCliente(urlBase, c => c.query(roteiro));
        await expect(comCliente(urlBase, c => c.query(roteiro))).rejects.toThrow(/já está aplicada/);

        const n = await comCliente(urlBase, c => c.query('SELECT count(*)::int AS n FROM a'));
        expect(n.rows[0].n, 'a segunda execução rodou o UP de novo').toBe(1);
    });

    it('BDD 2: com migration anterior pendente, recusa nomeando-a — e não aplica nada', async () => {
        escrever('202601020000_b', 'CREATE TABLE b (id int);');
        escrever('202601030000_c', 'CREATE TABLE c (id int);');
        const { roteiroDeAplicacao } = await runner();

        await expect(comCliente(urlBase, c => c.query(roteiroDeAplicacao(dir, '202601030000_c'))))
            .rejects.toThrow(/202601020000_b/);
        const t = await comCliente(urlBase, c => c.query(`SELECT to_regclass('public.c') AS t`));
        expect(t.rows[0].t, 'aplicou apesar de recusar').toBeNull();
    });

    it('BDD 2: UP que falha no meio → nada fica, nem o registro', async () => {
        escrever('202601020000_b', 'CREATE TABLE b (id int); SELECT * FROM nao_existe;');
        const { roteiroDeAplicacao, TABELA_REGISTRO } = await runner();

        // Com a mensagem do PRÓPRIO UP: um `toThrow()` sem ela passava na primeira
        // versão deste arquivo com `roteiroDeAplicacao is not a function`.
        await expect(comCliente(urlBase, c => c.query(roteiroDeAplicacao(dir, '202601020000_b'))))
            .rejects.toThrow(/nao_existe/);
        const r = await comCliente(urlBase, c => c.query(
            `SELECT to_regclass('public.b') AS t, (SELECT count(*)::int FROM ${TABELA_REGISTRO} WHERE nome = '202601020000_b') AS n`));
        expect(r.rows[0]).toEqual({ t: null, n: 0 });
    });
});

describe('TASK-109 — o roteiro sai da linha de comando sem conectar em nada', () => {
    it('BDD 3: `roteiro <migration>` imprime a transação sem pedir DATABASE_URL', () => {
        // Gerar o roteiro não precisa de credencial nenhuma — e não deve pedir: a URL
        // de produção fora do terminal é justamente o motivo de ele existir.
        const env = { ...process.env };
        delete env.DATABASE_URL;
        const saida = execFileSync(process.execPath,
            ['db/runner-migracoes.mjs', 'roteiro', '202609101600_api_de_dados_fechada'],
            { env, stdio: 'pipe', timeout: 15_000 }).toString();

        expect(saida).toMatch(/^BEGIN;/m);
        expect(saida).toMatch(/^COMMIT;/m);
        expect(saida).toContain('ALTER DEFAULT PRIVILEGES');
        expect(saida).toMatch(/INSERT INTO migracoes_aplicadas/);
    });
});
