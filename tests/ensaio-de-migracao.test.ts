import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './pg-test-config';
import { prepararBasePlataforma } from './base-plataforma-pg';

// TASK-107 (CR Tipo D · ADR-022) — migration que toca DADOS é ensaiada sobre uma
// cópia de produção antes de produção, e o ensaio deixa registro conferível.
//
// ## Por que só as que tocam dados
//
// A base da suíte é montada VAZIA pelo runner. Ela prova a sequência e a ida e volta
// do schema (TASK-106), mas não o que depende de dado: `SET NOT NULL` sobre linhas
// nulas, `UNIQUE` sobre duplicatas, um `UPDATE` que pega mais linhas do que se
// pensava. A `202609090900_sem_senha_compartilhada` — que ZERA senhas — foi conferida
// por uma consulta prévia no próprio banco de produção: produção foi o primeiro
// banco a vê-la. Decisão do usuário (ADR-022): cópia de produção só quando a
// migration toca dados, porque o ensaio traz a PII para a máquina de quem publica.
//
// ## Por que o registro leva o checksum do UP
//
// "Foi ensaiada" só vale para o arquivo que foi ensaiado. Se o UP mudar depois, o
// ensaio venceu — e a guarda tem de acusar, não aceitar o registro antigo.
//
// ## Por que o registro NÃO vai dentro do .up.sql
//
// Mudaria o checksum de migration já aplicada, e o `conferir` do runner acusaria
// alteração. Vai ao lado: `<nome>.ensaio.md`.

const RAIZ = process.cwd();
const DIR_REAL = path.resolve(RAIZ, 'db/migrations-pg');
const BASE = 'ensaio_teste';
const urlBase = TEST_DATABASE_URL.replace(/\/[^/]+$/, `/${BASE}`);
const urlAdmin = TEST_DATABASE_URL.replace(/\/[^/]+$/, '/postgres');
let dir: string;

async function comCliente<T>(url: string, f: (c: Client) => Promise<T>): Promise<T> {
    const c = new Client({ connectionString: url });
    await c.connect();
    try { return await f(c); } finally { await c.end(); }
}

function escrever(nome: string, up: string, down: string) {
    fs.writeFileSync(path.join(dir, `${nome}.up.sql`), up);
    fs.writeFileSync(path.join(dir, `${nome}.down.sql`), down);
}

const runner = () => import('../db/runner-migracoes.mjs');

describe('TASK-107 — o critério de "toca dados" é objetivo', () => {
    const tocam = [
        'UPDATE users SET a = 1;',
        'DELETE FROM x WHERE true;',
        'INSERT INTO x VALUES (1);',
        'TRUNCATE x;',
        'ALTER TABLE t ALTER COLUMN c SET NOT NULL;',
        'ALTER TABLE t ADD COLUMN c int NOT NULL DEFAULT 0;',
        'ALTER TABLE t ADD CONSTRAINT u UNIQUE (c);',
        'ALTER TABLE t ADD CONSTRAINT k CHECK (c > 0);',
        'ALTER TABLE t ADD CONSTRAINT f FOREIGN KEY (c) REFERENCES o(id);',
        'ALTER TABLE t ALTER COLUMN c TYPE int USING c::int;',
        'CREATE UNIQUE INDEX i ON t (c);',
    ];
    const naoTocam = [
        // Tabela NOVA nasce vazia: restrição ali não tem dado para violar.
        'CREATE TABLE t (id int NOT NULL UNIQUE, c int CHECK (c > 0));',
        'ALTER TABLE t ADD COLUMN c text;',
        'CREATE INDEX i ON t (c);',
        // `UPDATE` e `DELETE` aqui são EVENTOS de trigger e privilégios, não comandos.
        'CREATE TRIGGER g BEFORE UPDATE OR DELETE ON t FOR EACH ROW EXECUTE FUNCTION f();',
        'REVOKE UPDATE, DELETE ON TABLE t FROM anon;',
        'ALTER TABLE t ENABLE ROW LEVEL SECURITY;',
        // Corpo de função roda quando a função é CHAMADA, não quando a migration roda.
        'CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE t SET c = 1; RETURN NULL; END $$;',
        '-- DELETE FROM t; comentário explicando uma decisão',
    ];

    it('BDD 1: acusa DML e restrição que dado existente pode violar', async () => {
        const { tocaDados } = await runner();
        for (const sql of tocam) expect(tocaDados(sql), `não acusou: ${sql}`).not.toEqual([]);
    });

    it('BDD 1: não acusa o que não depende de dado — nem evento de trigger, nem corpo de função', async () => {
        const { tocaDados } = await runner();
        for (const sql of naoTocam) expect(tocaDados(sql), `acusou à toa: ${sql}`).toEqual([]);
    });

    it('BDD 1: nas migrations reais, só a que zera senhas toca dados', async () => {
        // Sanidade contra o repositório: se o critério acusasse metade das
        // migrations, o ensaio viraria burocracia e seria contornado.
        const { tocaDados, listarMigracoes } = await runner();
        const acusadas = listarMigracoes(DIR_REAL).filter(m => tocaDados(m.conteudo).length).map(m => m.nome);
        expect(acusadas).toEqual(['202609090900_sem_senha_compartilhada']);
    });
});

describe('TASK-107 — o ensaio roda sobre DADOS, e diz o que fez', () => {
    beforeEach(async () => {
        await comCliente(urlAdmin, async c => {
            await c.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
            await c.query(`CREATE DATABASE ${BASE}`);
        });
        await comCliente(urlBase, async c => {
            await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
            await prepararBasePlataforma(c);
        });
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensaio-'));
        // A "cópia de produção": uma tabela com dado real, já registrada.
        escrever('202601010000_t', 'CREATE TABLE t (id int PRIMARY KEY, c int);', 'DROP TABLE t;');
        const { aplicar } = await runner();
        await comCliente(urlBase, async c => {
            await aplicar(c, dir);
            await c.query('INSERT INTO t VALUES (1, NULL), (2, NULL), (3, 7)');
        });
    });

    afterAll(async () => {
        await comCliente(urlAdmin, c => c.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`));
    });

    it('BDD 2: conta as linhas de CADA comando e faz a ida e volta sobre os dados', async () => {
        escrever('202601020000_zera', 'UPDATE t SET c = 0 WHERE c IS NULL; DELETE FROM t WHERE c = 7;',
            '-- ⚠️ ROLLBACK PARCIAL: os dados alterados não voltam.');
        const { ensaiar } = await runner();
        const r = await comCliente(urlBase, c => ensaiar(c, dir, '202601020000_zera', { origem: 'teste.sql.gz' }));

        // É o número que a `202609090900` teve de ir buscar em produção: quantas
        // linhas o comando pega. Aqui sai de graça, da cópia.
        expect(r.comandos).toEqual([{ comando: 'UPDATE', linhas: 2 }, { comando: 'DELETE', linhas: 1 }]);
        expect(r.idaEVolta).toBe('ok');
    });

    it('BDD 2: dado que viola a restrição → recusa, nomeando a migration, e não registra', async () => {
        // O caso que a base vazia da suíte NUNCA pega: sem linhas, `SET NOT NULL`
        // sempre passa.
        escrever('202601020000_nn', 'ALTER TABLE t ALTER COLUMN c SET NOT NULL;',
            'ALTER TABLE t ALTER COLUMN c DROP NOT NULL;');
        const { ensaiar, TABELA_REGISTRO } = await runner();

        await expect(comCliente(urlBase, c => ensaiar(c, dir, '202601020000_nn', { origem: 'x' })))
            .rejects.toThrow(/202601020000_nn[\s\S]*null/i);
        const n = await comCliente(urlBase, c =>
            c.query(`SELECT count(*)::int AS n FROM ${TABELA_REGISTRO} WHERE nome = '202601020000_nn'`));
        expect(n.rows[0].n, 'registrou uma migration cujo ensaio falhou').toBe(0);
    });

    it('BDD 2: DOWN que não restaura o schema → recusa', async () => {
        escrever('202601020000_col', 'ALTER TABLE t ADD COLUMN d int; UPDATE t SET d = 1;', '-- esqueceram o DROP COLUMN');
        const { ensaiar } = await runner();
        await expect(comCliente(urlBase, c => ensaiar(c, dir, '202601020000_col', { origem: 'x' })))
            .rejects.toThrow(/202601020000_col[\s\S]*n[ãa]o restaura/);
    });

    it('BDD 2: a cópia tem de estar no ponto — pendente ANTES da ensaiada → recusa', async () => {
        // Ensaiar B com A pendente mediria B sobre um banco que produção não terá.
        escrever('202601020000_a', 'ALTER TABLE t ADD COLUMN a int;', 'ALTER TABLE t DROP COLUMN a;');
        escrever('202601030000_b', 'UPDATE t SET c = 1;', '-- sem volta de dados');
        const { ensaiar } = await runner();
        await expect(comCliente(urlBase, c => ensaiar(c, dir, '202601030000_b', { origem: 'x' })))
            .rejects.toThrow(/202601020000_a/);
    });

    it('BDD 2: o registro leva o checksum do UP e o resultado', async () => {
        escrever('202601020000_zera', 'UPDATE t SET c = 0 WHERE c IS NULL;', '-- sem volta de dados');
        const { ensaiar, registroDoEnsaio, listarMigracoes } = await runner();
        const r = await comCliente(urlBase, c => ensaiar(c, dir, '202601020000_zera', { origem: 'backups/2026/09/x.sql.gz' }));
        const texto = registroDoEnsaio(r);
        const checksum = listarMigracoes(dir).find(m => m.nome === '202601020000_zera')!.checksum;

        expect(texto).toContain(`up (sha256): ${checksum}`);
        expect(texto).toMatch(/resultado: ok/);
        expect(texto).toContain('backups/2026/09/x.sql.gz');
    });
});

describe('TASK-107 — o ensaio NUNCA roda em produção', () => {
    it('BDD 3: reconhece as URLs do Supabase', async () => {
        const { pareceProducao } = await runner();
        expect(pareceProducao('postgresql://postgres.abc:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres')).toBe(true);
        expect(pareceProducao('postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres')).toBe(true);
        expect(pareceProducao('postgresql://unifafire:x@localhost:15432/ensaio')).toBe(false);
    });

    it('BDD 3: a linha de comando recusa ANTES de conectar', () => {
        // Antes de conectar: a recusa não pode depender de a conexão falhar.
        let saida = '';
        let codigo = 0;
        try {
            execFileSync(process.execPath, ['db/runner-migracoes.mjs', 'ensaiar', 'qualquer', 'dump.sql.gz'], {
                env: { ...process.env, DATABASE_URL: 'postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres' },
                stdio: 'pipe', timeout: 15_000,
            });
        } catch (e) {
            const err = e as { status: number; stderr: Buffer };
            codigo = err.status;
            saida = String(err.stderr);
        }
        expect(codigo, 'ensaiou (ou tentou) contra produção').not.toBe(0);
        expect(saida).toMatch(/produ[çc][ãa]o/i);
    });
});

describe('TASK-107 — a guarda: migration que toca dados tem ensaio em dia', () => {
    it('BDD 4: todo UP que toca dados tem <nome>.ensaio.md com o checksum ATUAL e resultado ok', async () => {
        const { tocaDados, listarMigracoes } = await runner();
        const problemas: string[] = [];
        for (const m of listarMigracoes(DIR_REAL)) {
            if (!tocaDados(m.conteudo).length) continue;
            const arq = path.join(DIR_REAL, `${m.nome}.ensaio.md`);
            if (!fs.existsSync(arq)) { problemas.push(`${m.nome}: toca dados e não tem ensaio`); continue; }
            const texto = fs.readFileSync(arq, 'utf-8');
            if (!texto.includes(`up (sha256): ${m.checksum}`)) problemas.push(`${m.nome}: o ensaio é de OUTRA versão do UP`);
            if (!/resultado: ok/.test(texto)) problemas.push(`${m.nome}: o ensaio não terminou ok`);
        }
        expect(problemas, problemas.join('\n')).toEqual([]);
    });

    it('BDD 5: o runbook ensina o ensaio', () => {
        const runbook = fs.readFileSync(path.resolve(RAIZ, 'docs/runbook-deploy.md'), 'utf-8');
        expect(runbook).toMatch(/runner-migracoes\.mjs ensaiar/);
    });
});
