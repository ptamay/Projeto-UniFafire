import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-074 (Sprint 22 · Etapa 7a do ADR-012) — o log estruturado sai do
// filesystem e vai para `app_logs`.
//
// ## Por que esta task é pré-requisito do deploy, e não melhoria
//
// `structured-logger.ts` gravava com `fs.mkdirSync` + `fs.appendFileSync` em
// `logs/`. No Vercel o filesystem é efêmero e somente-leitura: a escrita falha,
// cai no `catch` que já existia e degrada para `console`. A aplicação NÃO quebra
// — e é exatamente esse o problema. Nada alerta, e a trilha some.
//
// A constitution §7 já registrava que arquivo em `logs/` não serve à hospedagem
// serverless, e o critério de aceite (d) do REQ-031 nomeia o log estruturado ao
// lado de `history` e `action_logs`.
//
// ## O cuidado que define estes testes
//
// Como a falha era silenciosa POR DESENHO, um teste que apenas verifique "a
// chamada não lançou" passaria com o defeito presente — foi assim que o defeito
// sobreviveu até aqui. Todo cenário abaixo afirma sobre A LINHA CHEGANDO EM
// `app_logs`, nunca sobre a chamada ter sobrevivido.

const falharEscrita = { ativo: false };

// Só as escritas em `app_logs` falham, e só quando ligado. `query`/`queryOne`
// continuam reais — são eles que provam o que ficou gravado.
vi.mock('@/lib/pg', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/pg')>();
    return {
        ...real,
        execute: async (sql: string, params?: unknown[]) => {
            if (falharEscrita.ativo && /app_logs/i.test(sql)) {
                throw new Error('falha proposital de escrita em app_logs');
            }
            return real.execute(sql, params);
        },
    };
});

const { query, queryOne, execute, withTransaction } = await import('@/lib/pg');
const { logStructured, logTiming, maskSensitive } = await import('@/lib/structured-logger');

const RAIZ = process.cwd();
const MIGRATIONS_PG = path.resolve(RAIZ, 'db', 'migrations-pg');

interface LinhaLog {
    level: string;
    message: string;
    context: Record<string, unknown> | null;
    ts: Date;
}

function ultima() {
    return queryOne<LinhaLog>('SELECT level, message, context, ts FROM app_logs ORDER BY id DESC LIMIT 1');
}

beforeEach(async () => {
    falharEscrita.ativo = false;
    await withTransaction(async (tx) => {
        await tx.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
        await tx.execute('DELETE FROM app_logs');
    });
});

describe('TASK-074 — a migration de app_logs é pareada (constitution §4.1)', () => {
    it('BDD 1: existe UP com a tabela e DOWN correspondente', () => {
        const ups = fs.readdirSync(MIGRATIONS_PG).filter(f => /app_logs.*\.up\.sql$/.test(f));
        expect(ups, 'nenhuma migration de app_logs em db/migrations-pg/').toHaveLength(1);

        const down = ups[0].replace(/\.up\.sql$/, '.down.sql');
        expect(
            fs.existsSync(path.join(MIGRATIONS_PG, down)),
            `UP sem DOWN pareado: ${down} ausente`,
        ).toBe(true);
    });

    it('BDD 1: a tabela existe no banco com as colunas que o logger usa', async () => {
        const cols = await query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'app_logs'`,
        );
        const nomes = cols.map(c => c.column_name);
        for (const c of ['id', 'ts', 'level', 'message', 'context']) {
            expect(nomes, `coluna ${c} ausente em app_logs`).toContain(c);
        }
    });
});

describe('TASK-074 — a linha é persistida em tabela, não em arquivo', () => {
    it('BDD 2: logStructured grava severidade, mensagem, contexto e instante', async () => {
        await logStructured('warn', 'operacao_de_teste', { rota: '/api/teste', quantidade: 3 });

        const l = await ultima();
        expect(l, 'nada chegou em app_logs — o logger ainda não persiste no banco').toBeDefined();
        expect(l!.level).toBe('warn');
        expect(l!.message).toBe('operacao_de_teste');
        expect(l!.context).toMatchObject({ rota: '/api/teste', quantidade: 3 });
        expect(l!.ts, 'o instante não veio como timestamptz').toBeInstanceOf(Date);
    });

    it('BDD 2: logTiming também chega, com a rota e a duração', async () => {
        await logTiming('POST /api/teste', 42);

        const l = await ultima();
        expect(l!.message).toBe('route_timing');
        expect(l!.context).toMatchObject({ route: 'POST /api/teste', duration_ms: 42, type: 'timing' });
    });

    it('BDD 2: rota lenta sobe para warn', async () => {
        await logTiming('POST /api/lenta', 900);
        expect((await ultima())!.level).toBe('warn');
    });

    it('BDD 2: NENHUMA escrita em logs/ acontece', async () => {
        const dir = path.resolve(RAIZ, 'logs');
        const antes = fs.existsSync(dir) ? fs.readdirSync(dir).length : null;

        await logStructured('info', 'nao_deve_ir_para_arquivo');

        const depois = fs.existsSync(dir) ? fs.readdirSync(dir).length : null;
        expect(depois, 'o logger criou ou escreveu arquivo em logs/').toBe(antes);
    });
});

describe('TASK-074 — a trilha é imutável como o history (constitution §7)', () => {
    it('BDD 3: UPDATE é recusado pelo banco', async () => {
        await logStructured('error', 'alvo_de_update');
        await expect(
            execute("UPDATE app_logs SET message = 'adulterado' WHERE message = 'alvo_de_update'"),
        ).rejects.toThrow(/imut|§7|app_logs/i);
    });

    it('BDD 3: DELETE é recusado pelo banco', async () => {
        await logStructured('error', 'alvo_de_delete');
        await expect(
            execute("DELETE FROM app_logs WHERE message = 'alvo_de_delete'"),
        ).rejects.toThrow(/imut|§7|app_logs/i);
    });

    it('BDD 3: INSERT continua permitido — a trilha cresce, nunca é reescrita', async () => {
        await expect(
            execute("INSERT INTO app_logs (level, message) VALUES ('info', 'crescimento_normal')"),
        ).resolves.toBe(1);
    });

    it('a garantia é do TRIGGER, não do REVOKE: o dono da tabela ignora REVOKE', async () => {
        // Mesma razão registrada na migration da TASK-065. Enquanto a aplicação
        // conectar com papel amplo, REVOKE é defesa em profundidade e o trigger
        // é o que de fato barra — inclusive para o dono.
        const t = await query<{ tgname: string }>(
            `SELECT tgname FROM pg_trigger tg
               JOIN pg_class c ON c.oid = tg.tgrelid
              WHERE c.relname = 'app_logs' AND NOT tg.tgisinternal`,
        );
        expect(t.length, 'app_logs sem trigger: o REVOKE sozinho não barra o dono').toBeGreaterThan(0);
    });
});

describe('TASK-074 — app_logs sobrevive ao REQ-014', () => {
    it('BDD 4: clear-database não limpa app_logs', async () => {
        await logStructured('warn', 'antes_da_limpeza');
        await execute("INSERT INTO keys (name) VALUES ('Chave 074')");

        const { POST } = await import('@/app/api/settings/clear-database/route');
        const res = await POST();
        expect(res.status).toBe(200);

        expect(await query('SELECT 1 FROM keys'), 'a limpeza não rodou').toEqual([]);

        const sobreviveu = await query(
            "SELECT 1 FROM app_logs WHERE message = 'antes_da_limpeza'",
        );
        expect(
            sobreviveu,
            'app_logs foi limpa: é o destino que precisa sobreviver ao REQ-014 (§7)',
        ).toHaveLength(1);
    });

    it('BDD 4: app_logs não está em tablesToClear', () => {
        const fonte = fs.readFileSync(
            path.resolve(RAIZ, 'src/app/api/settings/clear-database/route.ts'), 'utf-8',
        );
        const m = /tablesToClear\s*=\s*\[([^\]]*)\]/.exec(fonte);
        expect(m, 'tablesToClear não encontrada').not.toBeNull();
        expect(m![1], 'app_logs entrou na rotina de limpeza').not.toMatch(/app_logs/);
    });
});

describe('TASK-074 — a máscara de dados sensíveis continua valendo (§6.1)', () => {
    it('BDD 5: senha, token, hash e secret aparecem mascarados em app_logs', async () => {
        await logStructured('info', 'com_segredo', {
            password: 'senha-em-claro',
            token: 'jwt.muito.secreto',
            password_hash: '$2b$10$hashquenaopodevazar',
            secret: 'nao-vaza',
            rota: '/api/ok',
        });

        const l = await ultima();
        const ctx = JSON.stringify(l!.context);
        expect(ctx, 'senha em claro na trilha').not.toContain('senha-em-claro');
        expect(ctx, 'token na trilha').not.toContain('jwt.muito.secreto');
        expect(ctx, 'hash na trilha').not.toContain('$2b$10$hashquenaopodevazar');
        expect(ctx, 'secret na trilha').not.toContain('nao-vaza');
        expect(l!.context, 'a máscara comeu o que não era sensível').toMatchObject({ rota: '/api/ok' });
    });

    it('BDD 5: a máscara alcança qualquer profundidade', () => {
        const m = maskSensitive({ a: { b: { password: 'fundo' } } }) as Record<string, Record<string, Record<string, string>>>;
        expect(m.a.b.password).not.toBe('fundo');
    });
});

describe('TASK-074 — falha ao gravar não derruba a requisição', () => {
    it('BDD 6: logStructured não lança quando a escrita falha', async () => {
        falharEscrita.ativo = true;
        await expect(logStructured('error', 'com_banco_fora')).resolves.toBeUndefined();
    });

    it('BDD 6: a falha é sinalizada por canal que não depende da tabela', async () => {
        falharEscrita.ativo = true;
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await logStructured('error', 'com_banco_fora_2');
            const avisos = spy.mock.calls.map(c => String(c[0])).join('\n');
            expect(
                avisos,
                'a falha de persistência passou sem sinal nenhum — foi assim que o defeito de logs/ sobreviveu',
            ).toMatch(/structured-logger/i);
        } finally {
            spy.mockRestore();
        }
    });

    it('BDD 6: uma rota inteira continua respondendo com o log fora do ar', async () => {
        falharEscrita.ativo = true;
        const { POST } = await import('@/app/api/settings/clear-database/route');
        const res = await POST();
        expect(res.status, 'a rota caiu porque o log falhou').toBe(200);
    });
});

describe('TASK-074 — nada em src/ escreve no filesystem', () => {
    it('BDD 7: nenhuma escrita em disco no código da aplicação', () => {
        // O filesystem do destino é efêmero e somente-leitura. Qualquer escrita
        // ou falha em silêncio (o caso deste defeito) ou lança em produção.
        const alvos: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const fonte = fs.readFileSync(p, 'utf-8')
                        .replace(/\/\*[\s\S]*?\*\//g, '')
                        .replace(/^\s*\/\/.*$/gm, '');
                    if (/\b(appendFileSync|writeFileSync|mkdirSync|createWriteStream|appendFile|writeFile)\s*\(/.test(fonte)) {
                        alvos.push(p);
                    }
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(alvos, `escrita em disco no runtime:\n${alvos.join('\n')}`).toEqual([]);
    });

    it('BDD 7: o logger não expõe mais caminho de arquivo', () => {
        const fonte = fs.readFileSync(path.resolve(RAIZ, 'src/lib/structured-logger.ts'), 'utf-8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
        expect(fonte, 'ainda calcula caminho de arquivo de log').not.toMatch(/currentLogFilePath|logDir|LOG_DIR/);
    });
});
