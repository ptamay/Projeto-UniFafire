import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { query, execute, getPool } from '@/lib/pg';
import { withMaintenanceMode } from '@/lib/db-maintenance';
import { MIGRACOES_ESPERADAS } from '@/lib/migracoes-esperadas';

// TASK-124 (CR Tipo C · ADR-026) — a trilha de auditoria passa a ser imutável de verdade.
//
// ## O defeito, medido em 2026-09-13
//
// A §3.5 manda os endpoints destrutivos gravarem "entrada imutável no log de auditoria", e
// dois comentários de código (logout e reset de senha) decidiram com base nisso. No banco:
//
//     history      UPDATE/DELETE recusados (TASK-065)   TRUNCATE passa
//     app_logs     UPDATE/DELETE recusados (TASK-074)   TRUNCATE passa
//     backup_runs  UPDATE/DELETE recusados (TASK-078)   TRUNCATE passa
//     action_logs  UPDATE/DELETE PASSAM                 TRUNCATE passa
//     audit_logs   UPDATE/DELETE PASSAM                 TRUNCATE passa
//
// `action_logs` é a trilha que a tela de Logs mostra (REQ-010). E gatilho de linha não
// dispara em TRUNCATE: a forma mais barata de apagar tudo passava por cima dos três.
//
// ## O que esta suíte cobra
//
// Comportamento no banco real, não texto de migration: a escrita proibida é recusada, o
// bypass do modo de manutenção passa, e os fluxos que PRECISAM esvaziar a trilha (Limpar
// Banco, restauração) continuam funcionando. Cada cenário que usa o bypass desfaz o que
// fez — a trilha dos outros cenários não pode depender da ordem.

const TRILHA = ['history', 'action_logs', 'audit_logs', 'app_logs', 'backup_runs'] as const;

/** Uma linha mínima em cada tabela da trilha — o que cada uma exige para aceitar INSERT. */
const SEMENTE: Record<(typeof TRILHA)[number], string> = {
    history: `INSERT INTO history (action, username) VALUES ('withdraw', 'alvo_124')`,
    action_logs: `INSERT INTO action_logs (username, action, target, details) VALUES ('alvo_124', 'ALVO_124', 'x', 'original')`,
    audit_logs: `INSERT INTO audit_logs (action, details) VALUES ('ALVO_124', 'original')`,
    app_logs: `INSERT INTO app_logs (level, message) VALUES ('info', 'alvo_124')`,
    backup_runs: `INSERT INTO backup_runs (succeeded, destination) VALUES (true, 'alvo_124')`,
};

/** Roda `f` numa transação que SEMPRE desfaz — para exercitar o bypass sem apagar nada. */
async function desfeito(f: (c: { query: (sql: string) => Promise<unknown> }) => Promise<void>) {
    const c = await getPool().connect();
    try {
        await c.query('BEGIN');
        await f(c);
    } finally {
        await c.query('ROLLBACK');
        c.release();
    }
}

async function contar(t: string) {
    const [l] = await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`);
    return Number(l.n);
}

beforeEach(async () => {
    for (const t of TRILHA) await execute(SEMENTE[t]);
});

describe('TASK-124 — action_logs e audit_logs recusam UPDATE e DELETE', () => {
    for (const t of ['action_logs', 'audit_logs'] as const) {
        it(`BDD 1: UPDATE em ${t} é recusado, e a linha fica como estava`, async () => {
            await expect(execute(`UPDATE ${t} SET details = 'adulterado' WHERE action = 'ALVO_124'`))
                .rejects.toThrow(/imutável/);
            const [l] = await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t} WHERE details = 'adulterado'`);
            expect(Number(l.n), `${t} foi adulterada`).toBe(0);
        });

        it(`BDD 1: DELETE em ${t} é recusado`, async () => {
            const antes = await contar(t);
            await expect(execute(`DELETE FROM ${t} WHERE action = 'ALVO_124'`)).rejects.toThrow(/imutável/);
            expect(await contar(t)).toBe(antes);
        });

        it(`BDD 1: INSERT em ${t} continua livre — a trilha cresce, nunca é reescrita`, async () => {
            const antes = await contar(t);
            await execute(SEMENTE[t]);
            expect(await contar(t)).toBe(antes + 1);
        });
    }
});

describe('TASK-124 — TRUNCATE é recusado nas cinco tabelas da trilha', () => {
    for (const t of TRILHA) {
        it(`BDD 2: TRUNCATE ${t} é recusado fora do modo de manutenção`, async () => {
            const antes = await contar(t);
            expect(antes, 'a semente não entrou').toBeGreaterThan(0);
            await expect(execute(`TRUNCATE ${t} CASCADE`)).rejects.toThrow(/TRUNCATE/);
            expect(await contar(t), `${t} foi esvaziada`).toBe(antes);
        });
    }

    it('BDD 2: TRUNCATE que alcança a trilha POR CASCATA também é recusado', async () => {
        // O Limpar Banco apaga `keys` com CASCADE; sem o bypass, a cascata até `history`
        // é o mesmo esvaziamento por outro caminho.
        const antes = await contar('history');
        await expect(execute('TRUNCATE keys CASCADE')).rejects.toThrow(/TRUNCATE/);
        expect(await contar('history')).toBe(antes);
    });
});

describe('TASK-124 — o modo de manutenção é o único caminho, e é local à transação', () => {
    it('BDD 3: com o modo ligado, UPDATE, DELETE e TRUNCATE passam — e o bypass morre no fim da transação', async () => {
        await desfeito(async c => {
            await c.query("SELECT set_config('app.maintenance_mode', 'on', true)");
            await c.query(`UPDATE action_logs SET details = 'ok' WHERE action = 'ALVO_124'`);
            await c.query(`DELETE FROM audit_logs WHERE action = 'ALVO_124'`);
            await c.query(`TRUNCATE ${TRILHA.join(', ')} CASCADE`);
        });
        // Nada foi apagado (ROLLBACK), e fora da transação a trava voltou.
        expect(await contar('action_logs')).toBeGreaterThan(0);
        await expect(execute('TRUNCATE app_logs')).rejects.toThrow(/TRUNCATE/);
    });

    it('BDD 3: withMaintenanceMode (Limpar Banco, limpar histórico) passa pelos três gatilhos', async () => {
        // O mesmo helper que o Limpar Banco usa. Desfeito por erro proposital: withTransaction
        // faz ROLLBACK quando a função lança.
        const DESFAZER = new Error('desfazer');
        await expect(withMaintenanceMode(async tx => {
            await tx.execute('TRUNCATE history, action_logs, audit_logs, keys RESTART IDENTITY CASCADE');
            throw DESFAZER;
        })).rejects.toBe(DESFAZER);
        expect(await contar('history')).toBeGreaterThan(0);
    });
});

describe('TASK-124 — guarda: toda tabela da trilha tem os três gatilhos, ligados', () => {
    async function gatilhos() {
        // tgtype: bit 0 = linha (1) ou instrução (0); 1 = BEFORE; 3 = INSERT, 4 = DELETE, 5 = UPDATE, 6 = TRUNCATE.
        return query<{ tabela: string; linha: boolean; antes: boolean; del: boolean; upd: boolean; trunc: boolean; ligado: string }>(`
            SELECT c.relname AS tabela,
                   (t.tgtype & 1) <> 0 AS linha, (t.tgtype & 2) <> 0 AS antes,
                   (t.tgtype & 8) <> 0 AS del, (t.tgtype & 16) <> 0 AS upd, (t.tgtype & 32) <> 0 AS trunc,
                   t.tgenabled::text AS ligado
              FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND NOT t.tgisinternal`);
    }

    it('BDD 4: BEFORE UPDATE e BEFORE DELETE por linha, e BEFORE TRUNCATE por instrução, nas cinco', async () => {
        const g = await gatilhos();
        for (const t of TRILHA) {
            const daTabela = g.filter(x => x.tabela === t && x.antes && x.ligado !== 'D');
            expect(daTabela.some(x => x.linha && x.upd), `${t} sem gatilho de UPDATE`).toBe(true);
            expect(daTabela.some(x => x.linha && x.del), `${t} sem gatilho de DELETE`).toBe(true);
            expect(daTabela.some(x => !x.linha && x.trunc), `${t} sem gatilho de TRUNCATE`).toBe(true);
        }
    });

    it('BDD 4: a trilha é exatamente o que tem gatilho de TRUNCATE — tabela nova da trilha não fica de fora sem ninguém ver', async () => {
        const comTruncate = [...new Set((await gatilhos()).filter(x => x.trunc).map(x => x.tabela))].sort();
        expect(comTruncate).toEqual([...TRILHA].sort());
    });

    it('BDD 4: UPDATE, DELETE e TRUNCATE revogados de PUBLIC, anon e authenticated nas cinco', async () => {
        // Defesa em profundidade: o DONO ignora REVOKE, e é o gatilho que vale para todos.
        const papeis = await query<{ rolname: string }>(`SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`);
        for (const t of TRILHA) {
            for (const p of ['public', ...papeis.map(r => r.rolname)]) {
                const [l] = await query<{ pode: boolean }>(`
                    SELECT EXISTS (SELECT 1 FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = $1::regclass), '{}'))
                                    WHERE grantee = CASE WHEN $2::text = 'public' THEN 0 ELSE (SELECT oid FROM pg_roles WHERE rolname = $2::text) END
                                      AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')) AS pode`, [`public.${t}`, p]);
                expect(l.pode, `${p} ainda pode alterar ${t}`).toBe(false);
            }
        }
    });

    it('BDD 4: a migration está na lista do que o código espera — o health acusa se faltar em produção', () => {
        const m = fs.readdirSync(path.resolve(process.cwd(), 'db', 'migrations-pg')).find(f => /trilha_imutavel\.up\.sql$/.test(f));
        expect(m, 'migration da trilha imutável ausente').toBeDefined();
        expect(MIGRACOES_ESPERADAS).toContain(m!.replace(/\.up\.sql$/, ''));
    });
});

describe('TASK-124 — o que a constitution e o código afirmam passa a ser verdade', () => {
    it('BDD 5: os comentários que chamam action_logs de imutável continuam — agora sustentados pelo banco', () => {
        // Se alguém "corrigir" o comentário em vez do banco, ou vice-versa, isto avisa.
        for (const f of ['src/app/api/auth/logout/route.ts', 'src/app/api/users/reset-password/route.ts']) {
            expect(fs.readFileSync(path.resolve(process.cwd(), f), 'utf-8'), f).toMatch(/action_logs[^\n]*imut[áa]vel/i);
        }
    });
});
