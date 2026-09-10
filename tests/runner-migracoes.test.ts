import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './pg-test-config';

// TASK-101 (CR Tipo D · ADR-021) — um runner de migrations que registra o que
// aplicou. constitution §4.1.
//
// ## Por que existe
//
// Não havia runner. As migrations eram aplicadas à mão, pelo `psql` ou pelo editor
// SQL do Supabase, e o ledger do Supabase só recebia entrada quando quem aplicava
// se lembrava de escrevê-la. Em três dias isso produziu:
//
//   · CINCO divergências entre o ledger e o repositório, três delas criadas por
//     aplicações feitas com cuidado, por quem sabia o que estava fazendo;
//   · um incidente: a TASK-093 foi mergeada antes das colunas existirem, e resetar
//     acesso e criar usuário responderam 500 até a aplicação manual.
//
// Não é descuido. É ausência de ferramenta — e a divergência é CUMULATIVA.
//
// ## Por que registro próprio, e não o ledger do Supabase
//
// Qualquer editor SQL contorna o ledger sem avisar. Disputar com ele é perder. O
// que se pode ter é um registro que só existe se a migration foi aplicada por quem
// sabe escrevê-lo — e na MESMA transação, para que "aplicada" e "registrada" nunca
// divirjam.
//
// ## Onde este teste roda
//
// Numa base DESCARTÁVEL criada para ele, com migrations SINTÉTICAS num diretório
// temporário. A base da suíte já tem tudo aplicado e não serviria para provar
// ordem, falha ou reaplicação.

const BASE = 'runner_teste';
const urlBase = TEST_DATABASE_URL.replace(/\/[^/]+$/, `/${BASE}`);
const urlAdmin = TEST_DATABASE_URL.replace(/\/[^/]+$/, '/postgres');

let dir: string;

async function comCliente<T>(url: string, f: (c: Client) => Promise<T>): Promise<T> {
    const c = new Client({ connectionString: url });
    await c.connect();
    try { return await f(c); } finally { await c.end(); }
}

async function baseNova() {
    await comCliente(urlAdmin, async (c) => {
        await c.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
        await c.query(`CREATE DATABASE ${BASE}`);
    });
}

function escrever(nome: string, up: string, down = '-- down') {
    fs.writeFileSync(path.join(dir, `${nome}.up.sql`), up);
    fs.writeFileSync(path.join(dir, `${nome}.down.sql`), down);
}

async function runner() {
    return import('../db/runner-migracoes.mjs');
}

beforeEach(async () => {
    await baseNova();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migracoes-'));
});

afterAll(async () => {
    await comCliente(urlAdmin, c => c.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`));
});

describe('TASK-101 — aplica em ordem, e registra o que aplicou', () => {
    it('BDD 1: aplica pela ordem do prefixo, não pela do disco', async () => {
        // Ordem de disco depende do sistema de arquivos. A ordem que vale é a do
        // NOME — a mesma que a §4.1 manda e que o `ls` de quem aplica à mão vê.
        escrever('202601020000_b', 'CREATE TABLE b (id int REFERENCES a(id));');
        escrever('202601010000_a', 'CREATE TABLE a (id int PRIMARY KEY);');

        const { aplicar } = await runner();
        const r = await comCliente(urlBase, c => aplicar(c, dir));

        expect(r.aplicadas).toEqual(['202601010000_a', '202601020000_b']);
    });

    it('BDD 1: rodar de novo não reaplica nada', async () => {
        // A propriedade que torna o runner seguro de rodar a qualquer hora — em
        // particular logo depois de um merge, que é quando a TASK-093 quebrou.
        escrever('202601010000_a', 'CREATE TABLE a (id int PRIMARY KEY);');
        const { aplicar } = await runner();

        await comCliente(urlBase, c => aplicar(c, dir));
        const segunda = await comCliente(urlBase, c => aplicar(c, dir));

        expect(segunda.aplicadas, 'reaplicou migration já registrada').toEqual([]);
    });

    it('BDD 1: o registro nasce sozinho numa base vazia', async () => {
        // A tabela de registro é criada por uma migration, e a primeira migration
        // precisa da tabela para ser registrada. O runner resolve o ovo e a
        // galinha aplicando a do registro primeiro — ela não depende de nada.
        escrever('202601010000_a', 'CREATE TABLE a (id int PRIMARY KEY);');
        const { aplicar, TABELA_REGISTRO } = await runner();
        await comCliente(urlBase, c => aplicar(c, dir));

        const linhas = await comCliente(urlBase, c =>
            c.query(`SELECT nome FROM ${TABELA_REGISTRO} ORDER BY nome`));
        expect(linhas.rows.map(r => r.nome)).toContain('202601010000_a');
    });
});

describe('TASK-101 — falha ruidosa, e nunca pela metade', () => {
    it('BDD 2: migration que falha NÃO é registrada, e o que ela fez é desfeito', async () => {
        // "Aplicada" e "registrada" na mesma transação. Se a migration cria uma
        // tabela e depois falha, a tabela não pode ficar — senão a próxima
        // tentativa esbarra nela e o banco fica num estado que nenhum arquivo
        // descreve. Foi assim que o ledger do Supabase divergiu.
        escrever('202601010000_quebrada', 'CREATE TABLE meia (id int); SELECT * FROM nao_existe;');
        const { aplicar, TABELA_REGISTRO } = await runner();

        await expect(comCliente(urlBase, c => aplicar(c, dir))).rejects.toThrow(/202601010000_quebrada/);

        const sobrou = await comCliente(urlBase, c =>
            c.query(`SELECT to_regclass('public.meia') AS t`));
        expect(sobrou.rows[0].t, 'a migration falhou e deixou metade dela no banco').toBeNull();

        const registrada = await comCliente(urlBase, c =>
            c.query(`SELECT count(*)::int AS n FROM ${TABELA_REGISTRO} WHERE nome = '202601010000_quebrada'`));
        expect(registrada.rows[0].n, 'registrou uma migration que falhou').toBe(0);
    });

    it('BDD 2: para na primeira que falha — as seguintes não rodam', async () => {
        // Continuar depois de uma falha aplicaria migrations que PRESSUPÕEM a que
        // falhou. "Continua e avisa depois" é como se chega a um schema que nenhuma
        // sequência de arquivos produz.
        escrever('202601010000_ok', 'CREATE TABLE ok (id int);');
        escrever('202601020000_quebra', 'SELECT * FROM nao_existe;');
        escrever('202601030000_depois', 'CREATE TABLE depois (id int);');
        const { aplicar } = await runner();

        await expect(comCliente(urlBase, c => aplicar(c, dir))).rejects.toThrow();

        const t = await comCliente(urlBase, c =>
            c.query(`SELECT to_regclass('public.ok') AS ok, to_regclass('public.depois') AS depois`));
        expect(t.rows[0].ok, 'a que veio antes da falha deveria estar aplicada').not.toBeNull();
        expect(t.rows[0].depois, 'rodou uma migration DEPOIS da que falhou').toBeNull();
    });
});

describe('TASK-101 — a conferência diz o que o ledger não dizia', () => {
    it('BDD 3: aponta o que está PENDENTE', async () => {
        escrever('202601010000_a', 'CREATE TABLE a (id int);');
        const { aplicar, conferir } = await runner();
        await comCliente(urlBase, c => aplicar(c, dir));
        escrever('202601020000_nova', 'CREATE TABLE nova (id int);');

        const r = await comCliente(urlBase, c => conferir(c, dir));
        expect(r.pendentes).toEqual(['202601020000_nova']);
    });

    it('BDD 3: aponta arquivo ALTERADO depois de aplicado', async () => {
        // O registro guarda um hash do arquivo. Editar uma migration já aplicada é
        // o jeito mais silencioso de repositório e banco divergirem: o arquivo
        // descreve uma coisa, o banco tem outra, e nada reclama.
        escrever('202601010000_a', 'CREATE TABLE a (id int);');
        const { aplicar, conferir } = await runner();
        await comCliente(urlBase, c => aplicar(c, dir));
        escrever('202601010000_a', 'CREATE TABLE a (id int, extra text);');

        const r = await comCliente(urlBase, c => conferir(c, dir));
        expect(r.alteradas, 'arquivo editado depois de aplicado passou despercebido')
            .toEqual(['202601010000_a']);
    });

    it('BDD 3: aponta registro ÓRFÃO — aplicada sem arquivo', async () => {
        // É o caso do `search_path_history_imutavel_task_065`: está no banco e não
        // tem arquivo. Quem recriar a base a partir do repositório não a terá.
        escrever('202601010000_a', 'CREATE TABLE a (id int);');
        const { aplicar, conferir } = await runner();
        await comCliente(urlBase, c => aplicar(c, dir));
        fs.rmSync(path.join(dir, '202601010000_a.up.sql'));

        const r = await comCliente(urlBase, c => conferir(c, dir));
        expect(r.orfas).toEqual(['202601010000_a']);
    });

    it('BDD 3: base em dia não acusa nada', async () => {
        // Guarda contra conferência que sempre reclama — ela seria ignorada, e
        // conferência ignorada é pior que nenhuma.
        escrever('202601010000_a', 'CREATE TABLE a (id int);');
        const { aplicar, conferir } = await runner();
        await comCliente(urlBase, c => aplicar(c, dir));

        const r = await comCliente(urlBase, c => conferir(c, dir));
        expect({ p: r.pendentes, a: r.alteradas, o: r.orfas }).toEqual({ p: [], a: [], o: [] });
    });
});

describe('TASK-101 — o registro sobrevive a uma restauração', () => {
    it('BDD 4: a tabela de registro entra no backup', async () => {
        // ⚠️ Sem isto, restaurar um backup devolveria o banco SEM o registro — e o
        // runner, rodado sobre a base restaurada, tentaria reaplicar TUDO. É o
        // problema do ledger, recriado pelo próprio procedimento de recuperação.
        const { TABELAS_ESPERADAS } = await import('../db/backup-run.mjs');
        const { TABELA_REGISTRO } = await runner();
        expect(TABELAS_ESPERADAS, 'o backup não leva o registro de migrations').toContain(TABELA_REGISTRO);
    });
});
