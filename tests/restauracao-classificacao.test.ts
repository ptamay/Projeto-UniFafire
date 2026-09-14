import { describe, it, expect } from 'vitest';
import path from 'path';
import { query } from '@/lib/pg';

// TASK-115 (CR Tipo D · ADR-024, decisão 4) — restaurar da lista. Ciclo 1: o que volta
// no tempo e o que não volta.
//
// ## A classificação
//
// Restaurar troca SÓ as tabelas de negócio. A trilha de auditoria não volta no tempo
// (§3.5, §7.1), e a restauração fica registrada nela. Decisões do usuário em
// 2026-09-13: `login_attempts` e `rate_limit_hits` ficam como estão (estado de segurança
// do momento — voltar contadores de dias atrás desbloquearia quem está bloqueado agora),
// e `settings` também (é configuração, não dado: voltar a retenção de um backup antigo
// poderia apagar, no envio seguinte, backups que ninguém pediu para apagar).
//
// Toda tabela do schema tem de estar num dos dois lados. Tabela nova nasce fora da lista
// e reprova aqui — a decisão de restaurá-la ou não é de quem a cria, e não um acaso.
//
// ## O achado que muda o schema
//
// `action_logs.user_id`, `audit_logs.actor_id` e `audit_logs.target_user_id` tinham
// chave estrangeira para `users`. Com elas, restaurar é impossível sem destruir a trilha:
// quem foi criado depois do backup tem de sair de `users`, a trilha dessa pessoa impede
// (TRUNCATE sem CASCADE falha), e com CASCADE o Postgres apagaria a trilha junto. Decisão
// do usuário: tirar as três FKs. A trilha passa a ser registro histórico — guarda
// `user_id` e `username` do momento, independente de a conta existir hoje.
//
// O que impede um `user_id` antigo da trilha de apontar para OUTRA pessoa depois de uma
// restauração é que as sequências nunca voltam (ciclo 2): o id de quem sumiu não é
// reaproveitado.

const restauracao = () => import('../db/restaurar-backup.mjs');

async function tabelasDoSchema() {
    const linhas = await query<{ t: string }>(
        `SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`);
    return linhas.map(l => l.t);
}

describe('TASK-115 — cada tabela tem um lado', () => {
    it('BDD 1: toda tabela do schema é de negócio OU preservada — e nunca as duas', async () => {
        const { TABELAS_DE_NEGOCIO, TABELAS_PRESERVADAS } = await restauracao();
        const classificadas = [...TABELAS_DE_NEGOCIO, ...TABELAS_PRESERVADAS];
        expect(new Set(classificadas).size, 'tabela nos dois lados').toBe(classificadas.length);
        const faltando = (await tabelasDoSchema()).filter(t => !classificadas.includes(t));
        expect(faltando, 'tabela sem decisão sobre restaurar ou não').toEqual([]);
    });

    it('BDD 1: a trilha, o registro de migrations e o estado de segurança ficam; o negócio volta', async () => {
        const { TABELAS_DE_NEGOCIO, TABELAS_PRESERVADAS } = await restauracao();
        expect([...TABELAS_DE_NEGOCIO].sort()).toEqual(['history', 'key_transactions', 'keys', 'users']);
        for (const t of ['action_logs', 'audit_logs', 'app_logs', 'backup_runs', 'migracoes_aplicadas',
            'login_attempts', 'rate_limit_hits', 'settings']) {
            expect(TABELAS_PRESERVADAS, t).toContain(t);
        }
    });

    it('BDD 1: a ordem do negócio respeita as FKs — quem é referenciado entra antes', async () => {
        // A carga insere tabela por tabela com as FKs valendo; fora de ordem, a primeira
        // referência a uma linha ainda não inserida aborta a transação inteira.
        const { TABELAS_DE_NEGOCIO } = await restauracao();
        const fks = await query<{ de: string; para: string }>(
            `SELECT conrelid::regclass::text AS de, confrelid::regclass::text AS para
               FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`);
        for (const { de, para } of fks.filter(f => TABELAS_DE_NEGOCIO.includes(f.de) && f.de !== f.para)) {
            expect(TABELAS_DE_NEGOCIO.indexOf(para), `${de} → ${para}`).toBeLessThan(TABELAS_DE_NEGOCIO.indexOf(de));
        }
    });
});

describe('TASK-115 — a trilha não depende de users', () => {
    it('BDD 2: nenhuma tabela preservada tem FK para uma tabela de negócio', async () => {
        const { TABELAS_DE_NEGOCIO, TABELAS_PRESERVADAS } = await restauracao();
        const fks = await query<{ de: string; para: string; nome: string }>(
            `SELECT conrelid::regclass::text AS de, confrelid::regclass::text AS para, conname AS nome
               FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`);
        const proibidas = fks.filter(f => TABELAS_PRESERVADAS.includes(f.de) && TABELAS_DE_NEGOCIO.includes(f.para));
        expect(proibidas.map(f => `${f.de}.${f.nome} → ${f.para}`),
            'com esta FK, restaurar exige apagar a trilha em cascata — ou não restaurar').toEqual([]);
    });

    it('BDD 2: uma migration tira as três FKs — e só elas', async () => {
        const { listarMigracoes } = await import('../db/runner-migracoes.mjs');
        const m = listarMigracoes(path.resolve(process.cwd(), 'db/migrations-pg'))
            .find(x => /DROP CONSTRAINT/i.test(x.conteudo) && /action_logs_user_id_fkey/.test(x.conteudo));
        expect(m, 'nenhuma migration tira a FK da trilha').toBeTruthy();
        const drops = (m!.conteudo.replace(/--[^\n]*/g, '').match(/DROP CONSTRAINT\s+\w+/gi) ?? []).map(s => s.split(/\s+/).pop()).sort();
        expect(drops).toEqual(['action_logs_user_id_fkey', 'audit_logs_actor_id_fkey', 'audit_logs_target_user_id_fkey']);
    });

    it('BDD 2: sem a FK, a trilha continua aceitando registro de quem já não existe', async () => {
        // É o estado depois de uma restauração: a pessoa criada depois do backup some de
        // `users`, e o que ela fez continua na trilha, com o id e o nome da época.
        const { withTransaction } = await import('@/lib/pg');
        await expect(withTransaction(async (tx) => {
            await tx.execute(`INSERT INTO action_logs (user_id, username, action, target, timestamp)
                              VALUES (987654, 'quem_sumiu', 'TESTE', 'x', now())`);
            throw new Error('desfaz');
        })).rejects.toThrow('desfaz');
    });
});
