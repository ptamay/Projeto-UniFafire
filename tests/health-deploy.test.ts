import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

// TASK-079 (Sprint 23 · Etapa 7b do ADR-012) — deploy, ping contra a pausa por
// inatividade, e o fim do aparato local.
//
// ## Três coisas que não se parecem, e são a mesma
//
// O endpoint de saúde, o ping agendado e a remoção dos `.bat` parecem tarefas
// soltas. São o mesmo movimento: o sistema deixa de ser um processo numa máquina
// da instituição e passa a ser uma URL. O que sobrou da topologia antiga não é
// só inútil — é instrução ERRADA num repositório, que alguém vai seguir.
//
// ## O que o endpoint de saúde não pode ser
//
// A tentação é devolver "tudo que ajuda a diagnosticar": versão, uptime,
// variáveis, contagem de registros. Ele responde SEM SESSÃO, na internet
// pública. Cada campo desses é reconhecimento gratuito para quem estiver
// procurando o que atacar — e o `/api/server-info`, que esta task remove, era
// exatamente isso com uma sessão na frente: IPs da rede interna, hostname,
// plataforma, arquitetura e uptime da máquina.
//
// Por isso o cenário do vazamento não testa "não contém tal string": ele fixa a
// LISTA de chaves da resposta. Campo novo reprova por omissão, que é a mesma
// propriedade que a TASK-077 deu ao proxy.
//
// ## O limite honesto do cenário do build
//
// "`npm run build` sem `DATABASE_URL`" não roda aqui: são minutos por execução.
// O que este arquivo guarda é o MECANISMO da regressão — conexão criada no topo
// de módulo, que foi como a TASK-068 quebrou o build da primeira vez. O build de
// verdade está na DoD da sprint e roda antes do commit.

const RAIZ = process.cwd();
const WORKFLOWS = path.resolve(RAIZ, '.github', 'workflows');
const RUNBOOK = path.resolve(RAIZ, 'docs', 'runbook-deploy.md');

/** Fonte sem comentário — mesma convenção das guardas da TASK-074 e da TASK-075. */
function semComentarios(arquivo: string) {
    return fs.readFileSync(arquivo, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

function req(caminho: string) {
    return new NextRequest(new URL(`http://localhost${caminho}`));
}

function passou(res: Response) {
    return res.headers.has('x-middleware-next');
}

afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/lib/pg');
});

describe('TASK-079 — há um endpoint de saúde, e ele não vaza nada', () => {
    it('BDD 1: responde 200 sem sessão, confirmando aplicação e banco', async () => {
        const { GET } = await import('@/app/api/health/route');
        const res = await GET();
        expect(res.status).toBe(200);

        const corpo = await res.json();
        expect(corpo.status).toBe('ok');
        expect(corpo.database, 'o banco tem de ser CONSULTADO, não presumido').toBe('ok');
    });

    it('BDD 1: o proxy deixa a saúde passar sem sessão — senão o ping mede o login', async () => {
        const res = await proxy(req('/api/health'));
        expect(passou(res), '/api/health caiu na negação por padrão do proxy (TASK-077)').toBe(true);
    });

    it('BDD 1: a resposta tem uma lista FECHADA de campos', async () => {
        const { GET } = await import('@/app/api/health/route');
        const corpo = await (await GET()).json();

        // Campo novo reprova por omissão. É o mesmo desenho da lista pública do
        // proxy: cada campo aqui é uma porta, e portas se contam.
        expect(Object.keys(corpo).sort()).toEqual(['database', 'status']);
    });

    it('BDD 1: não revela versão, caminho, ambiente nem contagem', async () => {
        const { GET } = await import('@/app/api/health/route');
        const bruto = await (await GET()).text();

        expect(bruto, 'versão exposta').not.toMatch(/\d+\.\d+\.\d+/);
        expect(bruto, 'caminho de arquivo exposto').not.toMatch(/[A-Za-z]:\\|\/home\/|\/var\/|node_modules/);
        expect(bruto, 'string de conexão exposta').not.toMatch(/postgres(ql)?:\/\//i);
        expect(bruto, 'nome de variável de ambiente exposto').not.toMatch(/DATABASE_URL|JWT_SECRET|NODE_ENV/);
        expect(bruto, 'hostname ou plataforma expostos').not.toMatch(/hostname|platform|arch|uptime/i);
        expect(bruto, 'contagem de dados exposta').not.toMatch(/\b\d{2,}\b/);
    });

    it('BDD 1: banco fora do ar responde 503 — e continua não vazando', async () => {
        // Um health que responde 200 com o banco morto é pior do que nenhum:
        // o ping fica verde enquanto o sistema não serve para nada.
        vi.resetModules();
        vi.doMock('@/lib/pg', () => ({
            query: () => Promise.reject(new Error(
                'connect ECONNREFUSED postgresql://unifafire:senha@db.projeto.supabase.co:5432/postgres',
            )),
        }));

        const { GET } = await import('@/app/api/health/route');
        const res = await GET();
        expect(res.status).toBe(503);

        const bruto = await res.text();
        expect(bruto, 'a mensagem do driver vazou a string de conexão').not.toMatch(/supabase\.co|senha|ECONNREFUSED/);
    });
});

describe('TASK-079 — o ping agendado evita a pausa por inatividade', () => {
    const arquivo = path.join(WORKFLOWS, 'keepalive.yml');

    it('BDD 2: existe workflow agendado chamando a saúde', () => {
        expect(fs.existsSync(arquivo), 'sem ping, o projeto Supabase pausa em ~7 dias').toBe(true);
        const yml = fs.readFileSync(arquivo, 'utf-8');
        expect(yml).toMatch(/schedule:/);
        expect(yml).toMatch(/\/api\/health/);
    });

    it('BDD 2: o intervalo é menor que a janela de pausa', () => {
        const yml = fs.readFileSync(arquivo, 'utf-8');
        const cron = yml.match(/cron:\s*'([^']+)'/)?.[1];
        expect(cron, 'sem cron não há agenda').toBeTruthy();

        // Campo do dia-do-mês: `*` ou `*/n` com n < 7. Qualquer coisa que rode
        // menos de uma vez por semana deixa a janela de ~7 dias descoberta.
        const diaDoMes = cron!.split(/\s+/)[2];
        const passo = diaDoMes.startsWith('*/') ? Number(diaDoMes.slice(2)) : 1;
        expect(diaDoMes === '*' || passo < 7, `agenda "${cron}" é esparsa demais`).toBe(true);
    });

    it('BDD 2: a ressalva dos ~60 dias está registrada no próprio arquivo', () => {
        // GitHub desativa workflow agendado após ~60 dias sem atividade no
        // repositório. O ping que protege o banco morre calado, e o banco pausa
        // logo depois. Quem ler este arquivo daqui a um ano precisa saber disso.
        const yml = fs.readFileSync(arquivo, 'utf-8');
        expect(yml, 'a ressalva dos 60 dias não está escrita onde seria lida').toMatch(/60 dias/);
    });

    it('BDD 2: a URL vem de configuração, nunca literal (§6.2)', () => {
        const yml = fs.readFileSync(arquivo, 'utf-8');
        expect(yml).toMatch(/\$\{\{\s*(secrets|vars)\./);
        expect(yml, 'URL de produção escrita no arquivo').not.toMatch(/https:\/\/[a-z0-9-]+\.vercel\.app/i);
    });
});

describe('TASK-079 — o aparato local sai por inteiro', () => {
    it('BDD 3: não há .bat, ecosystem.config.js nem show-ip.js', () => {
        const sobras = [
            ...fs.readdirSync(RAIZ).filter(f => f.toLowerCase().endsWith('.bat')),
            ...(fs.existsSync(path.join(RAIZ, 'ecosystem.config.js')) ? ['ecosystem.config.js'] : []),
            ...(fs.existsSync(path.join(RAIZ, 'scripts', 'show-ip.js')) ? ['scripts/show-ip.js'] : []),
        ];
        expect(sobras, `topologia que não existe mais:\n${sobras.join('\n')}`).toEqual([]);
    });

    it('BDD 3: a rota /api/server-info não existe', () => {
        expect(
            fs.existsSync(path.resolve(RAIZ, 'src/app/api/server-info')),
            'ela devolvia IPs da rede interna, hostname, plataforma e uptime',
        ).toBe(false);
    });

    it('BDD 3: nenhum script do package.json invoca o aparato', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf-8'));
        const scripts = JSON.stringify(pkg.scripts ?? {});
        expect(scripts, 'script quebrado: chama arquivo removido').not.toMatch(/show-ip|ecosystem|\.bat/);
    });

    it('BDD 3: nada em src/ chama /api/server-info', () => {
        // Sem comentário, como as guardas da TASK-074, da TASK-075 e da
        // TASK-081: a varredura é sobre o que o código FAZ. A nota que explica
        // por que a rota morreu é registro, não chamada — e é justamente ela que
        // impede alguém de recriá-la.
        const achados: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name) && semComentarios(p).includes('/api/server-info')) {
                    achados.push(path.relative(RAIZ, p));
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(achados, `chamam rota removida:\n${achados.join('\n')}`).toEqual([]);
    });

    it('BDD 3: nada no repositório manda usar PM2 como se fosse a produção', () => {
        // Documentação errada é pior que documentação ausente: alguém a segue.
        const alvos = ['docs/runbook.md', 'docs/runbook-deploy.md', 'README.md']
            .map(f => path.resolve(RAIZ, f))
            .filter(f => fs.existsSync(f));

        const comPm2 = alvos.filter(f => /pm2 (start|restart|stop)/i.test(fs.readFileSync(f, 'utf-8')));
        expect(comPm2.map(f => path.relative(RAIZ, f)), 'ainda instrui a operar por PM2').toEqual([]);
    });
});

describe('TASK-079 — o build não exige banco', () => {
    it('BDD 4: nenhum módulo de src/ abre conexão em tempo de importação', () => {
        // O build do Next importa cada rota para coletar dados da página, e ali
        // não há `DATABASE_URL`. Foi assim que a TASK-068 quebrou o build — o
        // pool era criado no topo de `src/lib/pg.ts`. O build de verdade, sem a
        // variável, está na DoD da sprint; este teste guarda o mecanismo.
        const achados: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const fonte = fs.readFileSync(p, 'utf-8')
                        .replace(/\/\*[\s\S]*?\*\//g, '')
                        .replace(/^\s*\/\/.*$/gm, '');
                    // Chamada em escopo de módulo: começa na coluna zero.
                    if (/^(const|let|var)\s+\w+\s*=\s*(new Pool|getPool\(\))/m.test(fonte)) {
                        achados.push(path.relative(RAIZ, p));
                    }
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(achados, `conexão no topo do módulo:\n${achados.join('\n')}`).toEqual([]);
    });
});

describe('TASK-079 — o runbook existe e é executável por outra pessoa', () => {
    it('BDD 5: o arquivo existe', () => {
        expect(fs.existsSync(RUNBOOK)).toBe(true);
    });

    it('BDD 5: cobre deploy, secrets, bootstrap do ADMIN e restauração', () => {
        const texto = fs.readFileSync(RUNBOOK, 'utf-8');
        const exigidos: [string, RegExp][] = [
            ['deploy na Vercel', /vercel/i],
            ['os secrets do projeto', /JWT_SECRET/],
            ['a string de conexão', /DATABASE_URL/],
            ['os secrets do backup', /BACKUP_REPO_TOKEN/],
            ['o bootstrap do primeiro ADMIN', /bootstrap-admin\.mjs/],
            ['a restauração de um backup', /restaur/i],
            ['o ping contra a pausa', /keepalive|pausa/i],
        ];
        for (const [oque, regex] of exigidos) {
            expect(texto, `o runbook não cobre: ${oque}`).toMatch(regex);
        }
    });

    it('BDD 5: nomeia o responsável pós-entrega (constitution §4.3)', () => {
        const texto = fs.readFileSync(RUNBOOK, 'utf-8');
        expect(texto, 'sem responsável nomeado, o ensaio de restauração não é de ninguém')
            .toMatch(/respons[áa]ve(l|is)/i);
        expect(texto).toMatch(/Paulo Tamay/);
    });

    it('BDD 5: não manda ninguém restaurar por um botão que não existe mais', () => {
        // A TASK-075 removeu restaurar e excluir da tela. Um runbook que mande
        // clicar ali manda a pessoa procurar um botão inexistente no pior dia
        // possível.
        const texto = fs.readFileSync(RUNBOOK, 'utf-8');
        expect(texto, 'instrui restaurar pela tela de configurações').not.toMatch(
            /Backups Dispon[íi]veis|bot[ãa]o restaurar/i,
        );
    });
});
