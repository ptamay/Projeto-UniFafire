import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execute, queryOne } from '@/lib/pg';

// TASK-103 (CR Tipo D · ADR-021) — a aplicação verifica se o schema que o código
// espera está no banco, e AVISA. Nunca aplica.
//
// ## O incidente que isto fecha
//
// Em 2026-09-08 a TASK-093 foi mergeada, a Vercel publicou, e as colunas não
// existiam: resetar acesso e criar usuário responderam 500 até a aplicação manual.
// Ninguém foi avisado — descobriu-se usando. O runner (TASK-101) sabe o que está
// pendente, mas só quando alguém o roda. Falta o sistema DIZER.
//
// ## Por que avisa e não aplica
//
// Aplicar schema no boot de função serverless é várias instâncias correndo o mesmo
// DDL ao mesmo tempo, e um `ALTER TABLE` que falha pela metade em produção é pior
// que a janela que se quer fechar. §4.1: aplicar é ato deliberado de quem publica.
//
// ## Onde o aviso chega a alguém
//
// Aviso que ninguém lê não fecha janela nenhuma. `/api/health` já é o lugar onde se
// pergunta "o sistema serve?", e o `keepalive.yml` já falha — e o GitHub já manda
// e-mail — quando ele não responde `ok`. Mas o keepalive roda uma vez por DIA, e a
// janela da TASK-093 foi de horas. Por isso um segundo workflow pergunta logo depois
// de CADA deploy de produção: a Vercel registra o deploy no GitHub, e o evento
// `deployment_status` dispara em minutos.
//
// ## Por que a lista esperada mora em `src/`
//
// `db/` não sobe para a Vercel (`.vercelignore`, TASK-100): em produção não há
// arquivo de migration para listar. A lista é repetida em `src/`, e o cenário do
// BDD 1 reprova no instante em que ela divergir do diretório — é o autor da
// migration dizendo, no mesmo commit, "o código agora depende disto".

const RAIZ = process.cwd();
const ULTIMA = () => fs.readdirSync(path.resolve(RAIZ, 'db/migrations-pg'))
    .filter(f => f.endsWith('.up.sql')).sort().at(-1)!.replace(/\.up\.sql$/, '');

const semComentarios = (f: string) =>
    fs.readFileSync(path.resolve(RAIZ, f), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^\s*#.*$/gm, '');

let removida: { nome: string; checksum: string; modo: string } | undefined;

afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('@/lib/pg');
    if (removida) {
        await execute('INSERT INTO migracoes_aplicadas (nome, checksum, modo) VALUES ($1, $2, $3)',
            [removida.nome, removida.checksum, removida.modo]);
        removida = undefined;
    }
});

describe('TASK-103 — o código sabe de que schema depende', () => {
    it('BDD 1: a lista esperada é EXATAMENTE a do diretório de migrations', async () => {
        const { MIGRACOES_ESPERADAS } = await import('@/lib/migracoes-esperadas');
        const noDisco = fs.readdirSync(path.resolve(RAIZ, 'db/migrations-pg'))
            .filter(f => f.endsWith('.up.sql')).sort().map(f => f.replace(/\.up\.sql$/, ''));

        expect([...MIGRACOES_ESPERADAS],
            'migration nova no diretório e não em src/lib/migracoes-esperadas.ts (ou o contrário)')
            .toEqual(noDisco);
    });
});

describe('TASK-103 — o health diz quando o schema não chegou', () => {
    it('BDD 2: registro completo → 200 ok', async () => {
        const { GET } = await import('@/app/api/health/route');
        const res = await GET();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok', database: 'ok' });
    });

    it('BDD 2: migration esperada e NÃO registrada → 503, e o servidor loga QUAL', async () => {
        // É a TASK-093 reencenada: o código chegou, o schema não. Hoje o health
        // responderia 200 — `SELECT 1` passa — e o ping ficaria verde enquanto o
        // balcão não consegue cadastrar ninguém.
        const nome = ULTIMA();
        removida = await queryOne('SELECT nome, checksum, modo FROM migracoes_aplicadas WHERE nome = $1', [nome]);
        expect(removida, 'a suíte deveria ter a última migration registrada').toBeTruthy();
        await execute('DELETE FROM migracoes_aplicadas WHERE nome = $1', [nome]);

        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { GET } = await import('@/app/api/health/route');
        const res = await GET();

        expect(res.status, 'schema pendente e o health segue verde').toBe(503);
        const corpo = await res.json();
        expect(corpo.status).toBe('degraded');
        expect(corpo.database, 'o motivo não distingue schema pendente de banco fora do ar')
            .toBe('schema_pendente');
        expect(log.mock.calls.flat().join(' '), 'o log do servidor não diz qual migration falta')
            .toContain(nome);
    });

    it('BDD 2: para fora vai só o FATO — nenhum nome de migration', async () => {
        // A resposta é pública e sem sessão (TASK-079). O nome de uma migration
        // pendente conta a quem procura o que atacar qual controle ainda não está
        // no banco — e se for um trigger de imutabilidade, é exatamente a porta.
        const nome = ULTIMA();
        removida = await queryOne('SELECT nome, checksum, modo FROM migracoes_aplicadas WHERE nome = $1', [nome]);
        await execute('DELETE FROM migracoes_aplicadas WHERE nome = $1', [nome]);

        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { GET } = await import('@/app/api/health/route');
        const bruto = await (await GET()).text();

        expect(bruto).not.toContain(nome);
        expect(bruto, 'número de migration na resposta pública').not.toMatch(/\d{6,}/);
        expect(Object.keys(JSON.parse(bruto)).sort(), 'campo novo na resposta pública').toEqual(['database', 'status']);
    });

    it('BDD 2: sem a tabela de registro → também 503', async () => {
        // É o estado de produção até a adoção (TASK-102). Tratar "sem registro" como
        // "tudo certo" seria o health afirmar o que ninguém conferiu.
        vi.doMock('@/lib/pg', () => ({
            query: (sql: string) => /migracoes_aplicadas/.test(sql)
                ? Promise.reject(Object.assign(new Error('relation "migracoes_aplicadas" does not exist'), { code: '42P01' }))
                : Promise.resolve([{ '?column?': 1 }]),
        }));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { GET } = await import('@/app/api/health/route');
        const res = await GET();

        expect(res.status).toBe(503);
        expect((await res.json()).database).toBe('schema_pendente');
    });
});

describe('TASK-103 — verifica, e NUNCA aplica', () => {
    it('BDD 3: nada em src/ escreve schema nem chama o runner', () => {
        // A tentação óbvia, uma vez que o health já sabe o que falta, é aplicar dali.
        // É a alternativa que o ADR-021 rejeitou pelo nome.
        const achados: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const fonte = semComentarios(path.relative(RAIZ, p));
                    if (/runner-migracoes|INSERT\s+INTO\s+migracoes_aplicadas|\bALTER\s+TABLE\b|\bCREATE\s+(TABLE|INDEX|TRIGGER)\b/i.test(fonte)) {
                        achados.push(path.relative(RAIZ, p));
                    }
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(achados, `aplica schema a partir da aplicação:\n${achados.join('\n')}`).toEqual([]);
    });
});

describe('TASK-103 — alguém é avisado logo depois do deploy', () => {
    const arquivo = '.github/workflows/pos-deploy.yml';

    it('BDD 4: um workflow pergunta ao health a cada deploy de PRODUÇÃO bem-sucedido', () => {
        expect(fs.existsSync(path.resolve(RAIZ, arquivo)),
            'sem ele, o aviso só sai no ping diário — a janela da TASK-093 foi de horas').toBe(true);
        const yml = semComentarios(arquivo);
        expect(yml).toMatch(/deployment_status/);
        expect(yml, 'não filtra deploy bem-sucedido').toMatch(/state\s*==\s*'success'/);
        expect(yml, 'não filtra produção — preview também dispararia').toMatch(/environment\s*==\s*'Production'/);
    });

    it('BDD 4: falha de verdade quando o health não é ok', () => {
        // Sem `--fail`, um 503 com corpo JSON é "sucesso" para o curl, e o job fica
        // verde exatamente no caso que existe para acusar — o mesmo cuidado do
        // keepalive.
        const yml = semComentarios(arquivo);
        expect(yml).toMatch(/curl[^\n]*--fail/);
        expect(yml).toMatch(/"status":"ok"/);
    });

    it('BDD 4: o corpo impresso termina a linha antes da anotação de erro', () => {
        // Achado na PRIMEIRA execução real (2026-09-10, antes da adoção): o corpo
        // JSON não termina em quebra de linha, e o `::error::` saiu grudado nele —
        // `{"status":"degraded",...}::error::O deploy...`. O GitHub só transforma
        // em anotação o comando que COMEÇA a linha, então o motivo da falha não
        // apareceu no resumo do job, só enterrado no log.
        const yml = semComentarios(arquivo);
        const cats = [...yml.matchAll(/cat resposta\.json[^\n]*/g)].map(m => m[0]);
        expect(cats.length).toBeGreaterThan(0);
        for (const c of cats) {
            expect(c, `imprime o corpo sem terminar a linha: ${c}`).toMatch(/cat resposta\.json[^;&|]*;\s*echo\b/);
        }
    });

    it('BDD 4: URL por configuração, e o mínimo de permissão', () => {
        const yml = semComentarios(arquivo);
        expect(yml).toMatch(/\$\{\{\s*vars\.HEALTH_URL\s*\}\}/);
        expect(yml, 'URL de produção escrita no arquivo').not.toMatch(/https:\/\/[a-z0-9-]+\.vercel\.app/i);
        // O job só faz um curl. O token padrão do Actions pode escrever no
        // repositório — não há por que entregá-lo a quem não precisa.
        expect(yml, 'sem `permissions:`, o job herda o token padrão').toMatch(/^permissions:\s*\{\}/m);
    });
});
