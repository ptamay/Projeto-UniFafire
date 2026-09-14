import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import path from 'path';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './pg-test-config';
import { prepararBasePlataforma } from './base-plataforma-pg';

// TASK-115 (CR Tipo D · ADR-024, decisão 4) — ciclo 2: o motor da restauração.
//
// Dois bancos de verdade, montados pelo runner com as migrations reais: um faz o papel
// de PRODUÇÃO (estado de hoje) e o outro o do BACKUP já restaurado na base descartável
// (estado de dias atrás). O motor troca as tabelas de negócio da produção pelas do
// backup, numa transação.
//
// ## O que tem de ser verdade depois
//
// - as tabelas de negócio da produção são, linha por linha, as do backup;
// - as preservadas (trilha, registro, segurança, settings) estão EXATAMENTE como antes,
//   mais UMA linha na trilha dizendo quem restaurou o quê;
// - quem sumiu de `users` continua na trilha, com o id e o nome da época;
// - as sequências nunca recuam: o id de quem sumiu não é dado a outra pessoa — senão a
//   trilha antiga passaria a apontar para quem não fez aquilo;
// - qualquer falha no meio deixa a produção intocada (uma transação só);
// - backup de schema diferente é RECUSADO antes de tocar em qualquer coisa;
// - o ensaio faz tudo e desfaz no fim — é o que permite provar o caminho em produção
//   sem restaurar nada.

const PROD = 'restauro_producao';
const BKP = 'restauro_backup';
const urlDe = (base: string) => TEST_DATABASE_URL.replace(/\/[^/]+$/, `/${base}`);
const urlAdmin = urlDe('postgres');

async function comCliente<T>(url: string, f: (c: Client) => Promise<T>): Promise<T> {
    const c = new Client({ connectionString: url });
    await c.connect();
    try { return await f(c); } finally { await c.end(); }
}

async function montarBase(nome: string) {
    await comCliente(urlAdmin, async c => {
        await c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
        await c.query(`CREATE DATABASE ${nome}`);
    });
    await comCliente(urlDe(nome), async c => {
        await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
        await prepararBasePlataforma(c);
        const { aplicar } = await import('../db/runner-migracoes.mjs');
        await aplicar(c, path.resolve(process.cwd(), 'db/migrations-pg'));
    });
}

/** O estado de DIAS ATRÁS: duas pessoas, uma chave, uma movimentação. */
async function semearBackup(c: Client) {
    await c.query(`INSERT INTO users (id, username, password_hash, role, active) OVERRIDING SYSTEM VALUE VALUES
        (1, 'admin', 'hash_antigo_admin', 'ADMIN', true), (2, 'porteiro', 'hash_porteiro', 'PORTEIRO', true)`);
    await c.query(`INSERT INTO keys (id, name, room, status) OVERRIDING SYSTEM VALUE VALUES (1, 'Lab 1', 'B101', 'available')`);
    await c.query(`INSERT INTO key_transactions (id, key_id, user_id, action, status) OVERRIDING SYSTEM VALUE
        VALUES (1, 1, 2, 'withdraw', 'completed')`);
    await c.query(`INSERT INTO history (id, key_id, action, user_id, username, transaction_id) OVERRIDING SYSTEM VALUE
        VALUES (1, 1, 'withdraw', 2, 'porteiro', 1)`);
    for (const t of ['users', 'keys', 'key_transactions', 'history']) {
        await c.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), (SELECT max(id) FROM ${t}))`);
    }
}

/** O estado de HOJE: o admin trocou a senha, entrou uma pessoa nova (id 3) que já agiu,
 *  a chave mudou, surgiu outra chave, e há trilha, segurança e configuração. */
async function semearProducao(c: Client) {
    await c.query(`INSERT INTO users (id, username, password_hash, role, active) OVERRIDING SYSTEM VALUE VALUES
        (1, 'admin', 'hash_NOVO_admin', 'ADMIN', true), (2, 'porteiro', 'hash_porteiro', 'PORTEIRO', true),
        (3, 'nova_pessoa', 'hash_nova', 'FUNCIONARIO', true)`);
    await c.query(`INSERT INTO keys (id, name, room, status) OVERRIDING SYSTEM VALUE VALUES
        (1, 'Lab 1', 'B101', 'in_use'), (2, 'Lab 2', 'B102', 'available')`);
    await c.query(`INSERT INTO key_transactions (id, key_id, user_id, action, status) OVERRIDING SYSTEM VALUE VALUES
        (1, 1, 2, 'withdraw', 'completed'), (2, 1, 3, 'withdraw', 'completed')`);
    await c.query(`INSERT INTO history (id, key_id, action, user_id, username, transaction_id) OVERRIDING SYSTEM VALUE VALUES
        (1, 1, 'withdraw', 2, 'porteiro', 1), (2, 1, 'withdraw', 3, 'nova_pessoa', 2)`);
    for (const t of ['users', 'keys', 'key_transactions', 'history']) {
        await c.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), (SELECT max(id) FROM ${t}))`);
    }
    await c.query(`INSERT INTO action_logs (user_id, username, action, target, timestamp) VALUES
        (3, 'nova_pessoa', 'LOGIN_SUCCESS', 'auth', now()), (1, 'admin', 'USER_CREATED', 'nova_pessoa', now())`);
    await c.query(`INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (1, 3, 'ROLE_CHANGE', 'x')`);
    await c.query(`INSERT INTO login_attempts (username, ip, success) VALUES ('nova_pessoa', '1.2.3.4', false)`);
    await c.query(`INSERT INTO settings (key, value) VALUES ('backup_retencao_dias', '10')`);
    await c.query(`INSERT INTO backup_runs (ran_at, succeeded, size_bytes, destination)
        VALUES (now(), true, 1, 'dono/privado:backups/2026/09/2026-09-11T061700Z.sql.gz')`);
}

async function retrato(c: Client, tabelas: string[]) {
    const r: Record<string, unknown> = {};
    for (const t of tabelas) {
        r[t] = (await c.query(`SELECT coalesce(json_agg(x ORDER BY x) , '[]'::json) AS v FROM (SELECT * FROM ${t} ORDER BY 1) x`)).rows[0].v;
    }
    return r;
}

const motor = () => import('../db/restaurar-backup.mjs');
let prod: Client;
let bkp: Client;

beforeAll(async () => {
    await montarBase(PROD);
    await montarBase(BKP);
}, 120_000);

beforeEach(async () => {
    for (const nome of [PROD, BKP]) {
        await comCliente(urlDe(nome), c => c.query(`
            SELECT set_config('app.maintenance_mode', 'on', false);
            TRUNCATE users, keys, key_transactions, history, action_logs, audit_logs, login_attempts,
                     rate_limit_hits, settings, backup_runs RESTART IDENTITY CASCADE`));
    }
    await comCliente(urlDe(BKP), semearBackup);
    await comCliente(urlDe(PROD), semearProducao);
    prod = new Client({ connectionString: urlDe(PROD) });
    bkp = new Client({ connectionString: urlDe(BKP) });
    await prod.connect();
    await bkp.connect();
    return async () => { await prod.end(); await bkp.end(); };
});

afterAll(async () => {
    for (const nome of [PROD, BKP]) await comCliente(urlAdmin, c => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
});

describe('TASK-115 — o negócio volta, o resto fica', () => {
    it('BDD 3: as tabelas de negócio passam a ser, linha por linha, as do backup', async () => {
        const { restaurar, TABELAS_DE_NEGOCIO } = await motor();
        await restaurar(prod, bkp, { arquivo: 'backups/2026/09/2026-09-11T061700Z.sql.gz', pedidoPor: 'admin' });
        expect(await retrato(prod, TABELAS_DE_NEGOCIO)).toEqual(await retrato(bkp, TABELAS_DE_NEGOCIO));
        // O caso que o modal avisa: a senha volta à de antes.
        const admin = (await prod.query(`SELECT password_hash FROM users WHERE id = 1`)).rows[0];
        expect(admin.password_hash).toBe('hash_antigo_admin');
    });

    it('BDD 3: as preservadas ficam exatamente como estavam — mais UMA linha na trilha', async () => {
        const { restaurar, TABELAS_PRESERVADAS } = await motor();
        const semTrilha = TABELAS_PRESERVADAS.filter(t => t !== 'action_logs');
        const antes = await retrato(prod, semTrilha);
        const trilhaAntes = (await prod.query('SELECT count(*)::int AS n FROM action_logs')).rows[0].n;

        await restaurar(prod, bkp, { arquivo: 'backups/2026/09/2026-09-11T061700Z.sql.gz', pedidoPor: 'admin' });

        expect(await retrato(prod, semTrilha), 'uma tabela preservada mudou').toEqual(antes);
        expect((await prod.query('SELECT count(*)::int AS n FROM action_logs')).rows[0].n).toBe(trilhaAntes + 1);
        const r = (await prod.query(`SELECT username, details FROM action_logs WHERE action = 'BACKUP_RESTAURADO'`)).rows;
        expect(r).toHaveLength(1);
        expect(r[0].username).toBe('admin');
        expect(r[0].details).toContain('backups/2026/09/2026-09-11T061700Z.sql.gz');
    });

    it('BDD 3: quem sumiu de users continua na trilha, com o id e o nome da época', async () => {
        const { restaurar } = await motor();
        await restaurar(prod, bkp, { arquivo: 'backups/2026/09/2026-09-11T061700Z.sql.gz', pedidoPor: 'admin' });
        expect((await prod.query(`SELECT count(*)::int AS n FROM users WHERE id = 3`)).rows[0].n).toBe(0);
        const trilha = (await prod.query(`SELECT username FROM action_logs WHERE user_id = 3`)).rows;
        expect(trilha.map(l => l.username)).toEqual(['nova_pessoa']);
        expect((await prod.query(`SELECT count(*)::int AS n FROM audit_logs WHERE target_user_id = 3`)).rows[0].n).toBe(1);
    });

    it('BDD 4: as sequências nunca recuam — o id de quem sumiu não vai para outra pessoa', async () => {
        const { restaurar } = await motor();
        await restaurar(prod, bkp, { arquivo: 'backups/2026/09/2026-09-11T061700Z.sql.gz', pedidoPor: 'admin' });
        const nova = (await prod.query(`INSERT INTO users (username, password_hash, role) VALUES ('depois', 'h', 'ALUNO') RETURNING id`)).rows[0];
        expect(nova.id, 'a trilha de "nova_pessoa" (id 3) passaria a apontar para outra pessoa').toBeGreaterThan(3);
        const chave = (await prod.query(`INSERT INTO keys (name) VALUES ('Lab 9') RETURNING id`)).rows[0];
        expect(chave.id).toBeGreaterThan(2);
    });
});

describe('TASK-115 — tudo ou nada', () => {
    it('BDD 5: falha no meio da carga → a produção fica exatamente como estava', async () => {
        // Sabotagem: um gatilho que recusa a carga do history — a última tabela, depois
        // de users, keys e key_transactions já terem sido trocadas dentro da transação.
        const { restaurar, TABELAS_DE_NEGOCIO, TABELAS_PRESERVADAS } = await motor();
        await prod.query(`CREATE FUNCTION sabotagem() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'sabotagem na carga do history'; END $$;
            CREATE TRIGGER sabotagem BEFORE INSERT ON history FOR EACH ROW EXECUTE FUNCTION sabotagem();`);
        try {
            const antes = await retrato(prod, [...TABELAS_DE_NEGOCIO, ...TABELAS_PRESERVADAS]);
            await expect(restaurar(prod, bkp, { arquivo: 'backups/2026/09/2026-09-11T061700Z.sql.gz', pedidoPor: 'admin' }))
                .rejects.toThrow(/sabotagem/);
            expect(await retrato(prod, [...TABELAS_DE_NEGOCIO, ...TABELAS_PRESERVADAS]),
                'metade da restauração ficou gravada').toEqual(antes);
        } finally {
            await prod.query('DROP TRIGGER IF EXISTS sabotagem ON history; DROP FUNCTION IF EXISTS sabotagem()');
        }
    });
});

describe('TASK-115 — schema diferente é recusado antes de tocar em qualquer coisa', () => {
    it('BDD 6: o backup tem uma migration a menos → recusa, nomeando-a', async () => {
        const { restaurar, RestauracaoRecusada, TABELAS_DE_NEGOCIO } = await motor();
        await bkp.query(`DELETE FROM migracoes_aplicadas WHERE nome = '202609131200_trilha_independente_de_users'`);
        const antes = await retrato(prod, TABELAS_DE_NEGOCIO);
        const erro = await restaurar(prod, bkp, { arquivo: 'backups/2026/09/2026-09-11T061700Z.sql.gz', pedidoPor: 'admin' })
            .catch((e: unknown) => e);
        expect(erro).toBeInstanceOf(RestauracaoRecusada);
        expect(String(erro)).toContain('202609131200_trilha_independente_de_users');
        expect(await retrato(prod, TABELAS_DE_NEGOCIO)).toEqual(antes);
    });

    it('BDD 6: checksum diferente também é schema diferente', async () => {
        const { restaurar, RestauracaoRecusada } = await motor();
        await bkp.query(`UPDATE migracoes_aplicadas SET checksum = 'outro' WHERE nome = '202609101700_settings_orfas_de_backup'`);
        await expect(restaurar(prod, bkp, { arquivo: 'backups/2026/09/2026-09-11T061700Z.sql.gz', pedidoPor: 'admin' }))
            .rejects.toBeInstanceOf(RestauracaoRecusada);
    });

    it('BDD 6: backup sem registro de migrations (anterior a 2026-09-10) → recusa', async () => {
        const { restaurar, RestauracaoRecusada } = await motor();
        await bkp.query('DROP TABLE migracoes_aplicadas');
        await expect(restaurar(prod, bkp, { arquivo: 'backups/2026/09/2026-09-11T061700Z.sql.gz', pedidoPor: 'admin' }))
            .rejects.toBeInstanceOf(RestauracaoRecusada);
    });
});

describe('TASK-115 — o ensaio', () => {
    it('BDD 7: faz tudo e desfaz — a produção fica intocada, e a trilha diz que houve ensaio', async () => {
        const { restaurar, TABELAS_DE_NEGOCIO } = await motor();
        const antes = await retrato(prod, TABELAS_DE_NEGOCIO);
        const r = await restaurar(prod, bkp, { arquivo: 'backups/2026/09/2026-09-11T061700Z.sql.gz', pedidoPor: 'admin', ensaio: true });
        expect(await retrato(prod, TABELAS_DE_NEGOCIO), 'o ensaio restaurou de verdade').toEqual(antes);
        expect(r.depois.users, 'o ensaio não chegou a carregar').toBe(2);
        expect((await prod.query(`SELECT count(*)::int AS n FROM action_logs WHERE action = 'BACKUP_RESTAURADO'`)).rows[0].n).toBe(0);
        expect((await prod.query(`SELECT count(*)::int AS n FROM action_logs WHERE action = 'RESTAURACAO_ENSAIADA'`)).rows[0].n).toBe(1);
    });
});

describe('TASK-115 — só backup verificado, e só pelo nome (§1.5)', () => {
    it('BDD 8: caminho fora do padrão de backup é recusado — inclusive tentativa de sair de backups/', async () => {
        const { validarArquivo, RestauracaoRecusada } = await motor();
        for (const ruim of ['../segredo', 'backups/../../etc/passwd', 'backups/2026/09/x.sql', '/backups/2026/09/2026-09-11.sql.gz',
            'backups/2026/09/2026-09-11.sql.gz; rm -rf /', 'backups/2026/09/2026-09-11T061700Z.sql.gz\n']) {
            expect(() => validarArquivo(ruim), JSON.stringify(ruim)).toThrow(RestauracaoRecusada);
        }
        expect(validarArquivo('backups/2026/09/2026-09-11T061700Z.sql.gz')).toBe('backups/2026/09/2026-09-11T061700Z.sql.gz');
        expect(validarArquivo('backups/2026/09/2026-09-10.sql.gz')).toBe('backups/2026/09/2026-09-10.sql.gz');
    });

    it('BDD 8: só restaura o que backup_runs registra como verificado, com o destino exato', async () => {
        const { exigirBackupVerificado, RestauracaoRecusada } = await motor();
        await expect(exigirBackupVerificado(prod, { repo: 'dono/privado', arquivo: 'backups/2026/09/2026-09-11T061700Z.sql.gz' }))
            .resolves.toBeUndefined();
        await expect(exigirBackupVerificado(prod, { repo: 'dono/outro', arquivo: 'backups/2026/09/2026-09-11T061700Z.sql.gz' }))
            .rejects.toBeInstanceOf(RestauracaoRecusada);
        await prod.query(`INSERT INTO backup_runs (ran_at, succeeded, error, destination)
            VALUES (now(), false, 'falhou', 'dono/privado:backups/2026/09/2026-09-12T061700Z.sql.gz')`);
        await expect(exigirBackupVerificado(prod, { repo: 'dono/privado', arquivo: 'backups/2026/09/2026-09-12T061700Z.sql.gz' }))
            .rejects.toBeInstanceOf(RestauracaoRecusada);
    });
});
