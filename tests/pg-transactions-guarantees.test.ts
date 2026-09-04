import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { query, queryOne, execute, withTransaction, getPool } from '@/lib/pg';
import { withMaintenanceMode } from '@/lib/db-maintenance';

// TASK-070 (Sprint 21 · Etapa 4 do ADR-012) — transações explícitas com client
// dedicado.
//
// `db.transaction(() => …)` do better-sqlite3 é síncrono e não tem equivalente
// direto. No Postgres a transação vive num CLIENT DEDICADO tirado do pool, com
// BEGIN/COMMIT/ROLLBACK explícitos: com o pool solto, cada consulta poderia sair
// por uma conexão diferente e o BEGIN não alcançaria as demais.
//
// O que estes testes medem não é sintaxe — é a GARANTIA. Uma transação que roda
// sem transação nenhuma passa em qualquer teste de caminho feliz; só aparece
// quando algo falha no meio e o estado fica pela metade.
//
// Três usos, e o mais crítico deles já foi convertido na fatia (c): o fecho da
// dupla confirmação em `user-confirm`. Aqui ficam `db-maintenance` (o bypass da
// imutabilidade), `history/clear` e `settings/clear-database` (as duas operações
// destrutivas do REQ-014) e `settings/route`.

vi.mock('next/headers', () => ({
    cookies: () => ({ get: vi.fn().mockReturnValue({ value: 'token' }) }),
    headers: () => Promise.resolve(new Headers()),
}));

let sessao: { id: number; role: string; username: string } = { id: 1, role: 'ADMIN', username: 'test_admin' };
vi.mock('@/lib/session', () => ({
    verifySession: vi.fn().mockImplementation(() => Promise.resolve(sessao)),
}));

beforeEach(async () => {
    sessao = { id: 1, role: 'ADMIN', username: 'test_admin' };
    await withTransaction(async (t) => {
        await t.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
        await t.execute('DELETE FROM history');
    });
    await execute('DELETE FROM key_transactions');
    await execute('DELETE FROM action_logs');
    await execute('DELETE FROM settings');
});

describe('TASK-070 — o bypass da imutabilidade vive numa transação', () => {
    it('withMaintenanceMode permite o DELETE que o trigger bloqueia', async () => {
        await execute("INSERT INTO history (action, username) VALUES ('withdraw', 'alvo_070')");

        await expect(
            execute("DELETE FROM history WHERE username = 'alvo_070'"),
            'sem o bypass o trigger tem de barrar',
        ).rejects.toThrow(/REQ-005/);

        await withMaintenanceMode(async (tx) => {
            await tx.execute("DELETE FROM history WHERE username = 'alvo_070'");
        });

        const restantes = await query("SELECT 1 FROM history WHERE username = 'alvo_070'");
        expect(restantes, 'o bypass não deixou o DELETE passar').toEqual([]);
    });

    it('o bypass NÃO sobrevive à transação, e nada precisa ser limpo', async () => {
        await execute("INSERT INTO history (action, username) VALUES ('withdraw', 'sobrevivente')");

        await withMaintenanceMode(async (tx) => {
            await tx.execute("SELECT 1");
        });

        // Encerrado o bloco, o ajuste morreu com a transação — por construção do
        // Postgres (is_local), não por limpeza explícita de ninguém.
        await expect(
            execute("DELETE FROM history WHERE username = 'sobrevivente'"),
        ).rejects.toThrow(/REQ-005/);
    });

    it('erro dentro do bypass reverte tudo — inclusive o que já tinha sido apagado', async () => {
        await execute("INSERT INTO history (action, username) VALUES ('withdraw', 'reverter_1')");
        await execute("INSERT INTO history (action, username) VALUES ('return', 'reverter_2')");

        await expect(withMaintenanceMode(async (tx) => {
            await tx.execute("DELETE FROM history WHERE username = 'reverter_1'");
            throw new Error('falha proposital no meio');
        })).rejects.toThrow('falha proposital');

        const total = await queryOne<{ c: string }>('SELECT count(*) AS c FROM history');
        expect(
            Number(total?.c),
            'o DELETE persistiu apesar do erro: não havia transação de verdade',
        ).toBe(2);
    });

    it('a tabela-flag do SQLite não reaparece', async () => {
        const t = await query(
            "SELECT table_name FROM information_schema.tables WHERE table_name = '_maintenance_mode'",
        );
        expect(t, '_maintenance_mode voltou — o bypass deixou de ser transacional').toEqual([]);
    });
});

describe('TASK-070 — as duas operações destrutivas do REQ-014', () => {
    it('history/clear apaga o histórico e registra a trilha ANTES', async () => {
        await execute("INSERT INTO history (action, username) VALUES ('withdraw', 'a'), ('return', 'b')");

        const { DELETE } = await import('@/app/api/history/clear/route');
        const res = await DELETE();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.count, 'a contagem de apagados veio errada').toBe(2);

        expect(await query('SELECT 1 FROM history')).toEqual([]);

        // A trilha sobrevive: action_logs não é alvo do history/clear.
        const trilha = await queryOne<{ details: string }>(
            "SELECT details FROM action_logs WHERE action = 'CLEAR_HISTORY' ORDER BY id DESC LIMIT 1",
        );
        expect(trilha?.details).toMatch(/Iniciando/i);
    });

    it('clear-database limpa as tabelas de negócio sem sqlite_master nem sqlite_sequence', async () => {
        await execute("INSERT INTO keys (name) VALUES ('Chave 070')");
        await execute("INSERT INTO history (action, username) VALUES ('withdraw', 'x')");

        const { POST } = await import('@/app/api/settings/clear-database/route');
        const res = await POST();
        expect(res.status, 'a rota ainda consulta o catálogo do SQLite').toBe(200);

        expect(await query('SELECT 1 FROM history')).toEqual([]);
        expect(await query('SELECT 1 FROM keys')).toEqual([]);
    });

    it('nenhuma rota consulta mais o catálogo do SQLite', () => {
        // sqlite_master e sqlite_sequence não existem no Postgres. Uma consulta a
        // eles não é erro de tipo — é erro em tempo de execução, e só na operação
        // destrutiva, que é o pior lugar para descobrir.
        const alvos: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const fonte = fs.readFileSync(p, 'utf-8').replace(/\/\/.*$/gm, '');
                    if (/sqlite_master|sqlite_sequence/.test(fonte)) alvos.push(p);
                }
            }
        };
        varrer(path.resolve(process.cwd(), 'src'));
        expect(alvos, `catálogo do SQLite referenciado:\n${alvos.join('\n')}`).toEqual([]);
    });
});

describe('TASK-070 — settings grava tudo ou nada', () => {
    it('as quatro configurações entram juntas', async () => {
        const { POST } = await import('@/app/api/settings/route');
        const res = await POST(new Request('http://localhost/api/settings', {
            method: 'POST',
            body: JSON.stringify({
                autoLogoutTime: '45', backupTime: '04:00',
                backupCount: 9, defaultResetPassword: 'trocar-070',
            }),
        }) as never);

        expect(res.status).toBe(200);
        const linhas = await query<{ key: string; value: string }>('SELECT key, value FROM settings ORDER BY key');
        expect(Object.fromEntries(linhas.map(l => [l.key, l.value]))).toEqual({
            auto_logout_time: '45',
            backup_retention_count: '9',
            backup_time: '04:00',
            default_reset_password: 'trocar-070',
        });
    });
});

describe('TASK-070 — o pool não vaza conexão', () => {
    it('depois de tudo, nenhum client fica em uso', async () => {
        const pool = getPool();
        expect(pool.totalCount - pool.idleCount, 'client preso no pool').toBe(0);
    });
});

describe('TASK-070 — o SQLite sai do runtime', () => {
    it('src/lib/db.ts deixou de existir', () => {
        expect(
            fs.existsSync(path.resolve(process.cwd(), 'src/lib/db.ts')),
            'db.ts ainda existe: alguma coisa em src/ continua no SQLite',
        ).toBe(false);
    });

    it('nenhum arquivo de src/ importa better-sqlite3 nem @/lib/db', () => {
        const alvos: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const fonte = fs.readFileSync(p, 'utf-8').replace(/\/\/.*$/gm, '');
                    if (/from ['"](better-sqlite3|@\/lib\/db|\.\/db)['"]/.test(fonte)) alvos.push(p);
                }
            }
        };
        varrer(path.resolve(process.cwd(), 'src'));
        expect(alvos, `ainda em SQLite:\n${alvos.join('\n')}`).toEqual([]);
    });

    it('better-sqlite3 vira devDependency — as ferramentas offline ainda precisam dele', () => {
        // db/migrate.mjs e db/load-pg.mjs continuam usando: sao as ferramentas que
        // aplicam as migrations do keys.db e fazem a carga da Etapa 7 (decisao D3).
        const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
        expect(pkg.dependencies, 'addon nativo continua no runtime').not.toHaveProperty('better-sqlite3');
        expect(pkg.devDependencies).toHaveProperty('better-sqlite3');
    });

    it('o postinstall não inicializa mais um banco SQLite', () => {
        // `npm rebuild better-sqlite3 && node scripts/init-db.js` no postinstall
        // quebraria o build da hospedagem: nao ha keys.db para criar, e o rebuild
        // do addon nativo e exatamente o que a TASK-071 saiu de cima.
        const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
        expect(pkg.scripts.postinstall ?? '').not.toMatch(/init-db|better-sqlite3/);
    });
});

describe('TASK-070 — o backup por cópia de arquivo não finge funcionar', () => {
    it('createBackup recusa explicitamente, citando a TASK-078', async () => {
        const { createBackup } = await import('@/lib/backup');
        const r = createBackup();
        expect(r.success, 'nao pode responder sucesso').toBe(false);
        expect(r.error).toMatch(/TASK-078/);
    });

    it('startCronJobs não agenda nada', async () => {
        // node-cron precisa de processo de longa duracao, que nao existe em
        // execucao serverless. Agendar e nunca rodar seria pior do que nao
        // agendar: daria a impressao de que ha backup.
        const { startCronJobs } = await import('@/lib/backup');
        expect(() => startCronJobs()).not.toThrow();
        const fonte = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/backup.ts'), 'utf-8')
            .replace(/\/\/.*$/gm, '');
        expect(fonte, 'ainda agenda cron').not.toMatch(/cron\.schedule/);
    });
});
