import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { query, queryOne, execute, withTransaction, getPool } from '@/lib/pg';
import { registrarExecucao, TABELAS_ESPERADAS } from '../db/backup-run.mjs';
import {
    reconciliarContagens, DivergenciaDeContagem,
    compararEsquema, DivergenciaDeEsquema,
} from '../db/verify-dump.mjs';

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
        expect(l!.error, 'o usuário vazou junto').not.toMatch(/usuario/);
        // A credencial é MASCARADA, não removida: o resto da mensagem (host,
        // porta, banco) é o que permite diagnosticar a falha, e apagar tudo
        // deixaria o operador com um erro que não diz nada.
        expect(l!.error, 'a credencial não foi mascarada').toMatch(/postgresql:\/\/\*\*\*:\*\*\*@host:6543/);
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

describe('TASK-078 — contar linhas não basta: o esquema também tem de voltar', () => {
    // Achado no ciclo real, não no teste. Truncar o FIM de um dump não perde
    // linha nenhuma — as instruções finais são de esquema. No ensaio, o dump
    // truncado perdeu exatamente `ALTER TABLE public.users ENABLE ROW LEVEL
    // SECURITY;`, o `psql` restaurou sem erro, as contagens bateram, e a
    // verificação por linhas APROVOU.
    //
    // Medido: origem com 11 tabelas sob RLS, restauração com 10. Um backup que
    // volta com um controle de segurança a menos passa por idêntico se a única
    // pergunta for "quantas linhas?".

    const esquemaBase = {
        tabelas: ['users', 'keys'],
        indices: ['idx_history_timestamp'],
        triggers: ['history_no_update'],
        tabelasComRls: ['users', 'keys'],
        funcoes: ['history_imutavel'],
    };

    it('BDD 5b: esquemas iguais aprovam', () => {
        expect(() => compararEsquema(esquemaBase, { ...esquemaBase })).not.toThrow();
    });

    it('BDD 5b: RLS a menos REPROVA — foi o caso real do ensaio', () => {
        const destino = { ...esquemaBase, tabelasComRls: ['keys'] };
        let erro: unknown;
        try { compararEsquema(esquemaBase, destino); } catch (e) { erro = e; }

        expect(erro, 'perda de RLS passou despercebida').toBeInstanceOf(DivergenciaDeEsquema);
        expect(String(erro)).toMatch(/rls/i);
        expect(String(erro), 'o relatório não diz qual tabela').toMatch(/users/);
    });

    it('BDD 5b: trigger de imutabilidade a menos REPROVA', () => {
        // Sem o trigger, `history` deixa de ser imutável na base restaurada.
        // As linhas estariam todas lá, e a garantia do REQ-005 não.
        const destino = { ...esquemaBase, triggers: [] };
        expect(() => compararEsquema(esquemaBase, destino)).toThrow(DivergenciaDeEsquema);
    });

    it('BDD 5b: índice a menos REPROVA', () => {
        const destino = { ...esquemaBase, indices: [] };
        expect(() => compararEsquema(esquemaBase, destino)).toThrow(DivergenciaDeEsquema);
    });

    it('BDD 5b: objeto A MAIS também reprova — a base de verificação tinha resíduo', () => {
        const destino = { ...esquemaBase, tabelas: ['users', 'keys', 'sobra_de_execucao_anterior'] };
        expect(() => compararEsquema(esquemaBase, destino)).toThrow(DivergenciaDeEsquema);
    });

    it('BDD 5b: o relatório lista TODAS as diferenças, não só a primeira', () => {
        const destino = { ...esquemaBase, tabelasComRls: [], triggers: [], indices: [] };
        let erro: unknown;
        try { compararEsquema(esquemaBase, destino); } catch (e) { erro = e; }
        const texto = String(erro);
        expect(texto).toMatch(/rls/i);
        expect(texto).toMatch(/trigger/i);
        expect(texto).toMatch(/[íi]ndice/i);
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

    it('BDD 5: o dump é escopado ao schema `public` — senão a restauração aborta', () => {
        // Descoberto na PRIMEIRA execução real, em 2026-09-06 (run 34037968370):
        //
        //   ERROR: extension "supabase_vault" is not available
        //
        // `pg_dump` do banco inteiro emite `CREATE EXTENSION` para as extensões
        // da PLATAFORMA Supabase. A base de verificação é um `postgres:17` puro,
        // que não as tem, e o `psql -v ON_ERROR_STOP=1` aborta ali — antes de
        // restaurar uma linha sequer.
        //
        // É a mesma cegueira que `tests/global-setup-pg.ts` já tinha resolvido
        // para a suíte, provisionando a base da plataforma (papéis `anon` e
        // `authenticated`, a função `rls_auto_enable`) para que as migrations
        // rodassem idênticas. O job de verificação nasceu sem esse cuidado, e o
        // limite honesto registrado no `tasks.md` — "o ciclo completo não roda
        // aqui, depende de secrets" — é exatamente onde o defeito se escondeu.
        //
        // ## Por que escopar, e não tolerar o erro
        //
        // A correção tentadora é tirar o `ON_ERROR_STOP=1` e deixar o `psql`
        // engolir o que não entende. Isso destruiria a garantia inteira: um dump
        // TRUNCADO passaria a "restaurar com sucesso", que é precisamente o caso
        // que esta verificação existe para pegar.
        //
        // As 11 tabelas da aplicação vivem todas em `public`. As extensões da
        // plataforma vivem em `extensions`/`vault`/`auth`, não são nossas, e
        // qualquer projeto Supabase novo já as traz. Escopar torna o dump
        // portátil nos dois destinos que importam numa recuperação: um Postgres
        // puro e um projeto Supabase novo.
        expect(
            yml(),
            'pg_dump sem --schema=public arrasta as extensões da plataforma e a verificação aborta',
        ).toMatch(/--schema=public/);
    });

    it('BDD 5: a base de verificação e ESVAZIADA antes de restaurar', () => {
        // Segunda falha da execucao real, em 2026-09-06 (run 34038390932):
        //
        //   ERROR: schema "public" already exists
        //
        // Com `--schema=public`, o `pg_dump` passa a emitir `CREATE SCHEMA
        // public` — e o container `postgres:17` ja nasce com um. A restauracao
        // aborta na primeira instrucao.
        //
        // Derrubar o schema antes nao e so contornar esse erro: e o que torna
        // VERDADEIRA uma garantia que a reconciliacao ja assumia. O
        // `compararEsquema` trata objeto A MAIS no destino como divergencia,
        // dizendo que "a base de verificacao tinha residuo" — mas nada garantia
        // que ela estivesse limpa. Agora garante, e pelo mesmo gesto que o
        // `tests/global-setup-pg.ts` ja usava na suite.
        expect(
            yml(),
            'sem esvaziar a base, a restauracao aborta e um residuo passaria por dado restaurado',
        ).toMatch(/DROP SCHEMA IF EXISTS public CASCADE/);
    });

    it('BDD 5: a restauração continua parando no primeiro erro', () => {
        // Guarda do parágrafo acima: se alguém "consertar" um dump problemático
        // afrouxando o psql, o dump truncado volta a passar.
        expect(yml(), 'ON_ERROR_STOP saiu — restauração parcial passaria por boa')
            .toMatch(/ON_ERROR_STOP=1/);
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
