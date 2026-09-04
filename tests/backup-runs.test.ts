import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { query, queryOne, execute, withTransaction, getPool } from '@/lib/pg';
import { registrarExecucao, TABELAS_ESPERADAS } from '../db/backup-run.mjs';
import { reconciliarContagens, DivergenciaDeContagem } from '../db/verify-dump.mjs';

// TASK-078 (Sprint 23 · Etapa 7b do ADR-012) — backup diário verificado, e o
// registro de cada execução. constitution §4.3 (corrigida no CR Tipo D 7770d2e).
//
// ## Não havia backup nenhum
//
// `createBackup()` recusa desde a Sprint 21, e a §4.3 mandava "verificar o
// backup diário gerenciado pelo provedor" — que não existe no plano gratuito do
// Supabase. A cláusula descrevia um mecanismo inexistente; foi corrigida.
//
// ## Onde a lógica mora, e por quê
//
// A parte arriscada — restaurar e conferir — vive em `db/verify-dump.mjs`, não no
// YAML do workflow. YAML não tem teste: um erro de reconciliação ali só
// apareceria no dia em que o backup fosse necessário, que é o pior dia
// disponível. O workflow orquestra; a decisão de aprovar ou reprovar é código
// testado.
//
// ## O limite honesto destes testes
//
// O ciclo completo (dump → repositório privado → restauração) não roda aqui:
// depende de secrets e de um repositório que ainda não existem. O que estes
// cenários cobrem é o que dá para cobrir sem credencial — a tabela, a
// imutabilidade, o registro de sucesso E de falha, a lógica de reconciliação, e
// as propriedades do workflow. O ciclo real é verificação manual, e está na DoD.

vi.mock('next/headers', () => ({
    cookies: () => ({ get: vi.fn().mockReturnValue({ value: 'token' }), set: vi.fn() }),
    headers: () => Promise.resolve(new Headers()),
}));

const RAIZ = process.cwd();
const MIGRATIONS_PG = path.resolve(RAIZ, 'db', 'migrations-pg');
const WORKFLOW = path.resolve(RAIZ, '.github', 'workflows', 'backup.yml');

beforeEach(async () => {
    await withTransaction(async (tx) => {
        await tx.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
        await tx.execute('DELETE FROM backup_runs');
    });
});

describe('TASK-078 — a migration de backup_runs é pareada (§4.1)', () => {
    it('BDD 1: existe UP com a tabela e DOWN correspondente', () => {
        const ups = fs.readdirSync(MIGRATIONS_PG).filter(f => /backup_runs.*\.up\.sql$/.test(f));
        expect(ups, 'nenhuma migration de backup_runs').toHaveLength(1);
        const down = ups[0].replace(/\.up\.sql$/, '.down.sql');
        expect(fs.existsSync(path.join(MIGRATIONS_PG, down)), `DOWN ausente: ${down}`).toBe(true);
    });

    it('BDD 1: a tabela tem as colunas que a métrica da TASK-075 vai ler', async () => {
        const cols = await query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'backup_runs'`,
        );
        const nomes = cols.map(c => c.column_name);
        for (const c of ['id', 'ran_at', 'succeeded', 'size_bytes', 'error', 'destination']) {
            expect(nomes, `coluna ${c} ausente em backup_runs`).toContain(c);
        }
    });
});

describe('TASK-078 — toda execução é registrada, inclusive a que falhou', () => {
    it('BDD 2: sucesso grava instante, tamanho e destino', async () => {
        await registrarExecucao(getPool(), {
            succeeded: true,
            sizeBytes: 123456,
            destination: 'repo-privado:backups/2026-09-04.sql.gz',
        });

        const l = await queryOne<{ succeeded: boolean; size_bytes: string; error: string | null; ran_at: Date; destination: string }>(
            'SELECT succeeded, size_bytes, error, ran_at, destination FROM backup_runs ORDER BY id DESC LIMIT 1',
        );
        expect(l, 'nada foi registrado').toBeDefined();
        expect(l!.succeeded).toBe(true);
        expect(Number(l!.size_bytes)).toBe(123456);
        expect(l!.error).toBeNull();
        expect(l!.ran_at).toBeInstanceOf(Date);
        expect(l!.destination).toMatch(/repo-privado/);
    });

    it('BDD 2: FALHA vira registro, não ausência de registro', async () => {
        // O ponto da task. Se só o sucesso fosse gravado, "100% de sucesso" e
        // "nunca rodou" ficariam indistinguíveis — e a métrica da TASK-075
        // mostraria uma tranquilidade que não existe.
        await registrarExecucao(getPool(), {
            succeeded: false,
            error: 'pg_dump falhou: conexão recusada',
        });

        const l = await queryOne<{ succeeded: boolean; error: string }>(
            'SELECT succeeded, error FROM backup_runs ORDER BY id DESC LIMIT 1',
        );
        expect(l, 'a falha não foi registrada').toBeDefined();
        expect(l!.succeeded).toBe(false);
        expect(l!.error).toMatch(/conexão recusada/);
    });

    it('BDD 2: a mensagem de erro não carrega a string de conexão', async () => {
        // Mensagem de erro de `pg_dump` costuma ecoar a URL inteira, com senha.
        // Ela vai para uma tabela lida pela tela de configurações (§6.1).
        await registrarExecucao(getPool(), {
            succeeded: false,
            error: 'falha ao conectar em postgresql://usuario:SENHA_SECRETA@host:6543/postgres',
        });
        const l = await queryOne<{ error: string }>('SELECT error FROM backup_runs ORDER BY id DESC LIMIT 1');
        expect(l!.error, 'a senha vazou para backup_runs').not.toMatch(/SENHA_SECRETA/);
        expect(l!.error, 'a string de conexão inteira foi gravada').not.toMatch(/postgresql:\/\/[^\s]*:[^\s]*@/);
    });
});

describe('TASK-078 — a trilha de backup é imutável', () => {
    it('BDD 3: UPDATE e DELETE são recusados pelo banco', async () => {
        await registrarExecucao(getPool(), { succeeded: true, sizeBytes: 1 });

        await expect(
            execute('UPDATE backup_runs SET succeeded = false'),
        ).rejects.toThrow(/imut|§4.3|backup_runs/i);
        await expect(
            execute('DELETE FROM backup_runs'),
        ).rejects.toThrow(/imut|§4.3|backup_runs/i);
    });

    it('BDD 3: INSERT continua permitido', async () => {
        await expect(
            execute("INSERT INTO backup_runs (succeeded) VALUES (true)"),
        ).resolves.toBe(1);
    });
});

describe('TASK-078 — a verificação é por restauração, não por existência', () => {
    it('BDD 5: contagens iguais aprovam', () => {
        const origem = { users: 20, keys: 5, history: 30 };
        expect(() => reconciliarContagens(origem, { ...origem })).not.toThrow();
    });

    it('BDD 5: qualquer divergência REPROVA, e o relatório diz onde', () => {
        // Um dump truncado restaura sem erro nenhum: `psql` termina com sucesso
        // e a base fica com menos linhas. Sem reconciliar contagens, o job
        // aprovaria um backup pela metade.
        const origem = { users: 20, keys: 5, history: 30 };
        const destino = { users: 20, keys: 5, history: 29 };

        let erro: unknown;
        try { reconciliarContagens(origem, destino); } catch (e) { erro = e; }

        expect(erro, 'divergência de contagem passou').toBeInstanceOf(DivergenciaDeContagem);
        expect(String(erro)).toMatch(/history/);
        expect(String(erro), 'o relatório não diz os números').toMatch(/30/);
        expect(String(erro), 'tabela que bateu poluiu o relatório').not.toMatch(/\busers\b/);
    });

    it('BDD 5: tabela ausente no destino é divergência, não zero silencioso', () => {
        expect(() => reconciliarContagens({ users: 1 }, {})).toThrow(DivergenciaDeContagem);
    });

    it('BDD 5: a lista de tabelas conferidas é a do banco, não uma cópia solta', async () => {
        // Uma lista escrita à mão envelhece: tabela nova entra no schema e sai da
        // verificação sem ninguém notar — e o backup passa a cobrir menos do que diz.
        const reais = (await query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables
              WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
        )).map(t => t.table_name).sort();

        expect(
            [...TABELAS_ESPERADAS].sort(),
            'a lista de tabelas do backup divergiu do schema real',
        ).toEqual(reais);
    });
});

describe('TASK-078 — o workflow', () => {
    const yml = () => fs.readFileSync(WORKFLOW, 'utf-8');

    it('BDD 4: existe e roda em agenda diária', () => {
        expect(fs.existsSync(WORKFLOW), '.github/workflows/backup.yml ausente').toBe(true);
        expect(yml(), 'sem agenda — backup manual não cumpre RPO de 24 h').toMatch(/schedule:/);
        expect(yml()).toMatch(/cron:/);
    });

    it('BDD 6: o registro roda SEMPRE, inclusive quando o job falha', () => {
        // `if: always()` é o que transforma falha em registro. Sem ele, um job que
        // quebra no meio nao deixa rastro, e a metrica le "nenhuma execucao" —
        // exatamente a leitura errada.
        expect(yml(), 'sem if: always(), a falha nao e registrada').toMatch(/if:\s*always\(\)/);
    });

    it('BDD 6: o job falha alto quando a verificação reprova', () => {
        expect(yml(), 'o script de verificação não é invocado').toMatch(/verify-dump/);
    });

    it('BDD 7: nenhum segredo literal — tudo por secrets (§6.2)', () => {
        const fonte = yml();
        expect(fonte, 'string de conexão literal no workflow').not.toMatch(/postgresql:\/\/[^$\s]*:[^$\s]*@/);
        expect(fonte, 'DATABASE_URL não vem de secrets').toMatch(/secrets\.[A-Z_]*DATABASE_URL/);
    });

    it('BDD 4: o dump NÃO vira artefato deste repositório, que é público', () => {
        // Em repositório público, artefatos de workflow são baixáveis por
        // qualquer pessoa. Hoje os dados são fictícios; a partir do cadastro real
        // seriam PII de funcionários e alunos.
        expect(
            yml(),
            'upload-artifact no workflow de backup — o dump ficaria público',
        ).not.toMatch(/upload-artifact/);
    });
});
