import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './pg-test-config';

// TASK-102 (CR Tipo D · ADR-021) — a adoção: marcar como aplicado o que já está no
// banco, SEM reexecutar. É o passo perigoso do ADR-021.
//
// ## Por que existe
//
// O registro nasce vazio e o banco não. Produção tem nove migrations aplicadas à
// mão e nenhuma no registro. Rodar o runner lá sem adoção faria ele tentar TODAS de
// novo — e a primeira `CREATE TABLE` falharia. Ou pior: um `CREATE TRIGGER` que
// duplica sem falhar.
//
// ## O risco não é quebrar. É MENTIR.
//
// Adotar é afirmar "isto já está no banco". Se a afirmação for falsa, o runner
// nunca aplica a migration — ela está registrada — e o banco fica SEM ela, em
// silêncio. É a falha que o runbook §4.2 já nomeou: "migration que falta CALA em
// vez de gritar". Uma adoção que marca sem conferir recria o ledger mentiroso do
// Supabase, só que dentro do nosso próprio registro.
//
// Por isso a adoção PROVA antes de marcar: extrai de cada migration os objetos que
// ela declara (tabela, índice, trigger, função, coluna) e confere cada um no
// catálogo do Postgres. Faltou um, recusa — e para.

const BASE = 'adocao_teste';
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
    await comCliente(urlAdmin, async (c) => {
        await c.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
        await c.query(`CREATE DATABASE ${BASE}`);
    });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adocao-'));
});

afterAll(async () => {
    await comCliente(urlAdmin, c => c.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`));
});

describe('TASK-102 — adota o que está lá, sem rodar', () => {
    it('BDD 1: marca como adotada e NÃO reexecuta', async () => {
        // O banco já tem a tabela, criada "à mão" como produção foi. A adoção tem de
        // registrar sem rodar — se rodasse, o `CREATE TABLE` falharia.
        escrever('202601010000_a', 'CREATE TABLE a (id int PRIMARY KEY);');
        await comCliente(urlBase, c => c.query('CREATE TABLE a (id int PRIMARY KEY)'));

        const { adotar, TABELA_REGISTRO } = await runner();
        const r = await comCliente(urlBase, c => adotar(c, dir, { ate: '202601010000_a' }));
        expect(r.adotadas).toEqual(['202601010000_a']);

        const linha = await comCliente(urlBase, c =>
            c.query(`SELECT modo FROM ${TABELA_REGISTRO} WHERE nome = '202601010000_a'`));
        expect(linha.rows[0].modo, 'foi registrada como aplicada, não como adotada').toBe('adotada');
    });

    it('BDD 1: depois da adoção, `aplicar` roda só o que é NOVO', async () => {
        // É o critério de sucesso inteiro da task: produção adotada, e o runner
        // passa a aplicar apenas as migrations que chegarem depois.
        escrever('202601010000_a', 'CREATE TABLE a (id int PRIMARY KEY);');
        escrever('202601020000_nova', 'CREATE TABLE nova (id int);');
        await comCliente(urlBase, c => c.query('CREATE TABLE a (id int PRIMARY KEY)'));

        const { adotar, aplicar } = await runner();
        await comCliente(urlBase, c => adotar(c, dir, { ate: '202601010000_a' }));
        const r = await comCliente(urlBase, c => aplicar(c, dir));

        expect(r.aplicadas, 'reaplicou o que foi adotado, ou não aplicou o novo').toEqual(['202601020000_nova']);
    });

    it('BDD 1: não adota nada DEPOIS do corte', async () => {
        // `ate` é obrigatório por isso. Adotar "tudo que tem arquivo" marcaria como
        // aplicada uma migration que acabou de chegar e nunca rodou em lugar nenhum.
        escrever('202601010000_a', 'CREATE TABLE a (id int);');
        escrever('202601020000_b', 'CREATE TABLE b (id int);');
        await comCliente(urlBase, c => c.query('CREATE TABLE a (id int)'));

        const { adotar } = await runner();
        const r = await comCliente(urlBase, c => adotar(c, dir, { ate: '202601010000_a' }));
        expect(r.adotadas, 'adotou além do corte').toEqual(['202601010000_a']);
    });
});

describe('TASK-102 — recusa mentir', () => {
    it('BDD 2: tabela declarada e AUSENTE → recusa, e não marca nada', async () => {
        // O cenário que justifica a task inteira. Sem esta recusa, a adoção
        // registraria `b` como aplicada, o runner nunca a criaria, e o banco ficaria
        // sem a tabela para sempre — sem erro nenhum.
        escrever('202601010000_a', 'CREATE TABLE a (id int);');
        escrever('202601020000_b', 'CREATE TABLE b (id int);');
        await comCliente(urlBase, c => c.query('CREATE TABLE a (id int)'));  // `b` NÃO existe

        const { adotar, TABELA_REGISTRO } = await runner();
        await expect(
            comCliente(urlBase, c => adotar(c, dir, { ate: '202601020000_b' })),
        ).rejects.toThrow(/202601020000_b[\s\S]*\bb\b/);

        const n = await comCliente(urlBase, c =>
            c.query(`SELECT count(*)::int AS n FROM ${TABELA_REGISTRO} WHERE modo = 'adotada'`));
        expect(n.rows[0].n, 'adotou parcialmente antes de recusar').toBe(0);
    });

    it('BDD 2: coluna declarada e AUSENTE → recusa', async () => {
        // Coluna é o caso mais traiçoeiro: a tabela existe, então uma checagem só
        // de tabelas passaria. Foi uma coluna ausente que derrubou reset e criação
        // de usuário na TASK-093.
        escrever('202601010000_col', 'CREATE TABLE t (id int); ALTER TABLE t ADD COLUMN extra text;');
        await comCliente(urlBase, c => c.query('CREATE TABLE t (id int)'));  // sem `extra`

        const { adotar } = await runner();
        await expect(
            comCliente(urlBase, c => adotar(c, dir, { ate: '202601010000_col' })),
        ).rejects.toThrow(/extra/);
    });

    it('BDD 2: trigger declarado e AUSENTE → recusa', async () => {
        // A imutabilidade da §7.1 inteira mora em trigger, e trigger ausente NÃO SE
        // MANIFESTA: a escrita proibida simplesmente passa. É o objeto que mais
        // importa conferir, e o que menos daria sinal se faltasse.
        escrever('202601010000_trg', `
            CREATE TABLE t (id int);
            CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
            CREATE TRIGGER t_imutavel BEFORE DELETE ON t FOR EACH ROW EXECUTE FUNCTION f();
        `);
        await comCliente(urlBase, async c => {
            await c.query('CREATE TABLE t (id int)');
            await c.query('CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$');
            // o trigger NÃO foi criado
        });

        const { adotar } = await runner();
        await expect(
            comCliente(urlBase, c => adotar(c, dir, { ate: '202601010000_trg' })),
        ).rejects.toThrow(/t_imutavel/);
    });

    it('BDD 2: RLS declarada e DESLIGADA → recusa', async () => {
        // RLS não é objeto, é ESTADO da tabela — e a sonda que só procura objetos
        // não a vê. É o controle que mais importa neste projeto: a chave anônima do
        // Supabase está no bundle do navegador (Realtime), e RLS desligada entrega a
        // tabela a quem a abrir. Sem sintoma nenhum na aplicação.
        escrever('202601010000_rls', 'CREATE TABLE t (id int); ALTER TABLE t ENABLE ROW LEVEL SECURITY;');
        await comCliente(urlBase, c => c.query('CREATE TABLE t (id int)'));  // RLS NÃO ligada

        const { adotar } = await runner();
        await expect(
            comCliente(urlBase, c => adotar(c, dir, { ate: '202601010000_rls' })),
        ).rejects.toThrow(/202601010000_rls[\s\S]*rls t\b/);
    });

    it('BDD 2: VÁRIAS colunas num único ALTER — confere todas, não só a primeira', async () => {
        // `ADD COLUMN a, ADD COLUMN b` é SQL comum. Uma sonda que casa só a primeira
        // afirmaria `b` sem tê-la procurado — a mentira que a task existe para
        // impedir, pelo caminho mais discreto.
        escrever('202601010000_duas', 'CREATE TABLE t (id int); ALTER TABLE t ADD COLUMN a text, ADD COLUMN b numeric(10, 2);');
        await comCliente(urlBase, c => c.query('CREATE TABLE t (id int, a text)'));  // sem `b`

        const { adotar } = await runner();
        await expect(
            comCliente(urlBase, c => adotar(c, dir, { ate: '202601010000_duas' })),
        ).rejects.toThrow(/coluna t\.b\b/);
    });

    it('BDD 2: ADD CONSTRAINT é restrição, não uma coluna chamada "constraint"', async () => {
        // O padrão de coluna aceita `ADD` sem `COLUMN`, então sem cuidado lê
        // `ADD CONSTRAINT t_pk` como a coluna `constraint` — e a recusa sairia com o
        // motivo errado, apontando para algo que ninguém declarou.
        escrever('202601010000_pk', 'CREATE TABLE t (id int); ALTER TABLE t ADD CONSTRAINT t_pk PRIMARY KEY (id);');
        await comCliente(urlBase, c => c.query('CREATE TABLE t (id int)'));  // sem a restrição

        const { adotar } = await runner();
        const erro = await comCliente(urlBase, c => adotar(c, dir, { ate: '202601010000_pk' }))
            .then(() => null, (e: Error) => e.message);
        expect(erro, 'adotou sem a restrição declarada').toMatch(/t_pk/);
        expect(erro, 'leu ADD CONSTRAINT como coluna').not.toMatch(/coluna t\.constraint/i);
    });
});

describe('TASK-102 — o que a adoção não consegue provar', () => {
    it('BDD 3: migration só de DADOS é adotada, mas dita como não verificável', async () => {
        // `DELETE` e `UPDATE` não deixam objeto no catálogo para conferir. A
        // `202609090900_sem_senha_compartilhada` de produção é assim. Recusá-la
        // impediria a adoção inteira; aceitá-la em silêncio esconderia que ninguém
        // conferiu. O meio honesto é aceitar e DIZER.
        escrever('202601010000_dados', "DELETE FROM x WHERE false;");

        const { adotar } = await runner();
        const r = await comCliente(urlBase, c => adotar(c, dir, { ate: '202601010000_dados' }));
        expect(r.naoVerificaveis, 'adotou migration de dados sem avisar que não conferiu')
            .toEqual(['202601010000_dados']);
    });

    it('BDD 3: sem `ate`, recusa — adoção nunca é implícita', async () => {
        const { adotar } = await runner();
        await expect(
            comCliente(urlBase, c => adotar(c, dir, {} as never)),
        ).rejects.toThrow(/ate/);
    });
});
