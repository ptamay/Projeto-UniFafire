import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './pg-test-config';

// TASK-113 (CR Tipo D · ADR-024, decisão 2) — retenção de verdade.
//
// ## Por que "de verdade"
//
// Tirar um dump da pasta não o apaga: ele continua no histórico do git do repositório
// privado, com nome, matrícula e telefone de todo mundo, para sempre. E isto não é
// hipótese — foi medido no repositório de produção em 2026-09-10: o
// `backups/2026/09/2026-09-10.sql.gz` foi gravado DUAS vezes (a execução manual do
// ADR-023 e a agendada), e a primeira versão não aparece em pasta nenhuma, mas está lá,
// no commit 380f778. Nomear por dia sobrescreve; sobrescrever esconde uma cópia.
//
// Por isso a poda não é `git rm`: o job reescreve o repositório como um único commit
// com os arquivos da janela, e força o push. O que sai da janela deixa de ser alcançável
// por qualquer ref — é isso que os cenários de git abaixo conferem, contra um
// repositório de verdade, e não contra uma lista em memória.
//
// ## As guardas (ADR-024, decisão 2)
//
// - nunca apaga se o dump novo não foi verificado — a poda é o mesmo passo que o envia,
//   e só roda depois da restauração de verificação;
// - nunca fica sem nenhum — o dump novo é sempre mantido;
// - 3 a 30 dias: abaixo de 3, um dump ruim e verificado por azar deixaria pouca escolha;
// - retenção DESCONHECIDA (agenda ilegível) não apaga nada. É o espelho do portão da
//   TASK-112: lá, na dúvida, executa; aqui, na dúvida, não apaga — as duas escolhas são
//   pelo lado em que o erro é reparável.
//
// ## Por que o envio saiu do YAML
//
// Lição do go-live: o job de backup passou em 25 testes e falhou nas três primeiras
// execuções reais, porque o que quebrou foi a ORQUESTRAÇÃO em volta da lógica, que nenhum
// teste alcançava. Um `git push --force` escrito no YAML seria orquestração irreversível
// sem teste nenhum. Ele mora em `db/enviar-backup.mjs`, exercitado aqui contra um
// repositório bare local.

const RAIZ = process.cwd();
const ler = (f: string) => fs.readFileSync(path.resolve(RAIZ, f), 'utf-8');
const semComentarios = (f: string) => ler(f)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(\/\/|#).*$/gm, '');

const politica = () => import('@/lib/agenda-backup.mjs');
const envio = () => import('../db/enviar-backup.mjs');
const utc = (s: string) => new Date(s);

afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/lib/session');
    vi.doUnmock('next/headers');
});

describe('TASK-113 — a retenção é validada na escrita E na leitura', () => {
    it('BDD 1: sem configuração, 7 dias', async () => {
        const { lerAgenda, AGENDA_PADRAO } = await politica();
        expect(AGENDA_PADRAO.dias).toBe(7);
        expect(lerAgenda({}).dias).toBe(7);
    });

    it('BDD 1: de 3 a 30 dias; valor herdado inválido cai no padrão', async () => {
        const { lerAgenda, LIMITES, CHAVES } = await politica();
        expect(LIMITES.dias).toEqual([3, 30]);
        expect(CHAVES.dias, 'reaproveitar backup_retention_count faria um valor esquecido virar a retenção')
            .not.toBe('backup_retention_count');
        expect(lerAgenda({ [CHAVES.dias]: '10' }).dias).toBe(10);
        for (const ruim of ['2', '31', '0', '-7', 'sete', '7.5', '']) {
            expect(lerAgenda({ [CHAVES.dias]: ruim }).dias, `"${ruim}"`).toBe(7);
        }
    });
});

describe('TASK-113 — o nome do arquivo tem hora', () => {
    it('BDD 2: dois backups no mesmo dia não se sobrescrevem', async () => {
        // Com nome por dia, o segundo backup do dia reescreve o primeiro — e a versão
        // reescrita fica no histórico, fora da vista e fora da retenção.
        const { nomeDoArquivo } = await envio();
        expect(nomeDoArquivo(utc('2026-09-11T06:17:42Z'))).toBe('backups/2026/09/2026-09-11T061742Z.sql.gz');
        expect(nomeDoArquivo(utc('2026-09-11T18:17:05Z'))).not.toBe(nomeDoArquivo(utc('2026-09-11T06:17:42Z')));
    });

    it('BDD 2: o nome não tem ":" — o repositório é clonado em Windows', async () => {
        const { nomeDoArquivo } = await envio();
        expect(nomeDoArquivo(utc('2026-09-11T06:17:42Z'))).not.toMatch(/:/);
    });
});

describe('TASK-113 — o plano da poda', () => {
    // Recife = UTC−3. 2026-09-11T06:20Z = 03:20 do dia 11 em Recife. Com 7 dias, ficam
    // os dias 05 a 11 (hoje e os 6 anteriores): com um backup por dia, exatamente 7.
    const agora = utc('2026-09-11T06:20:00Z');
    const novo = 'backups/2026/09/2026-09-11T062000Z.sql.gz';

    it('BDD 3: mantém a janela em dias de Recife, e apaga o que é mais velho', async () => {
        const { planejarPoda } = await envio();
        const r = planejarPoda({
            arquivos: [
                'backups/2026/09/2026-09-04.sql.gz',
                'backups/2026/09/2026-09-05.sql.gz',
                'backups/2026/09/2026-09-10.sql.gz',
                novo,
            ],
            novo, agora, dias: 7,
        });
        expect(r.apagar).toEqual(['backups/2026/09/2026-09-04.sql.gz']);
        expect(r.manter).toEqual(expect.arrayContaining(['backups/2026/09/2026-09-05.sql.gz', 'backups/2026/09/2026-09-10.sql.gz', novo]));
    });

    it('BDD 3: o dia é o de Recife, não o do UTC', async () => {
        // 02:00Z do dia 05 é 23:00 do dia 04 em Recife — fora de uma janela que começa
        // no dia 05. Pelo UTC, ficaria.
        const { planejarPoda } = await envio();
        const r = planejarPoda({ arquivos: ['backups/2026/09/2026-09-05T020000Z.sql.gz', novo], novo, agora, dias: 7 });
        expect(r.apagar).toEqual(['backups/2026/09/2026-09-05T020000Z.sql.gz']);
    });

    it('BDD 3: o que não tem nome de backup nunca é apagado', async () => {
        // Não se apaga o que não se entende. O README do repositório, uma nota deixada
        // por alguém num dia de incidente — ficam.
        const { planejarPoda } = await envio();
        const estranhos = ['README.md', 'backups/2026/09/notas.txt', 'backups/2020/01/2020-01-01.sql'];
        const r = planejarPoda({ arquivos: [...estranhos, novo], novo, agora, dias: 7 });
        expect(r.apagar).toEqual([]);
        expect(r.manter).toEqual(expect.arrayContaining(estranhos));
    });

    it('BDD 4: o dump novo é sempre mantido — nunca fica sem nenhum', async () => {
        // Dez dias sem backup, e o de hoje é o único na janela: ele fica, e todo o resto
        // (fora da janela) sai. O repositório nunca termina vazio.
        const { planejarPoda } = await envio();
        const r = planejarPoda({
            arquivos: ['backups/2026/08/2026-08-30.sql.gz', 'backups/2026/09/2026-09-01.sql.gz', novo],
            novo, agora, dias: 3,
        });
        expect(r.manter).toEqual([novo]);
        expect(r.apagar).toHaveLength(2);
    });

    it('BDD 4: sem o dump novo entre os arquivos, recusa — nada é apagado', async () => {
        const { planejarPoda } = await envio();
        expect(() => planejarPoda({ arquivos: ['backups/2026/09/2026-09-01.sql.gz'], novo, agora, dias: 7 }))
            .toThrow(/dump novo/);
    });

    it('BDD 4: retenção fora de 3–30 é recusada, e não "corrigida"', async () => {
        // Quem chama já leu a agenda validada. Um valor fora da faixa aqui é defeito de
        // quem chamou — e o erro de um passo que APAGA tem de ser parar.
        const { planejarPoda } = await envio();
        for (const dias of [0, 2, 31, 7.5, Number.NaN]) {
            expect(() => planejarPoda({ arquivos: [novo], novo, agora, dias }), String(dias)).toThrow(/reten/i);
        }
    });
});

// ─── Contra um repositório git de verdade ────────────────────────────────────────

const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function dumpFalso(conteudo: string) {
    return zlib.gzipSync(Buffer.from(`-- dump falso\n${conteudo}\n`));
}

let tmp: string;
let remoto: string;       // repositório bare — o "GitHub"
let remotoUrl: string;

/** Monta o remoto com um histórico parecido com o de produção. */
function semearRemoto(arquivos: Array<[string, string]>) {
    remoto = path.join(tmp, 'remoto.git');
    git(tmp, 'init', '--bare', '--quiet', '-b', 'main', remoto);
    remotoUrl = pathToFileURL(remoto).href;
    const trab = path.join(tmp, 'semente');
    git(tmp, 'clone', '--quiet', remotoUrl, trab);
    git(trab, 'config', 'user.name', 'teste');
    git(trab, 'config', 'user.email', 'teste@example.invalid');
    git(trab, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    for (const [caminho, conteudo] of arquivos) {
        fs.mkdirSync(path.dirname(path.join(trab, caminho)), { recursive: true });
        fs.writeFileSync(path.join(trab, caminho), caminho.endsWith('.gz') ? dumpFalso(conteudo) : conteudo);
        git(trab, 'add', caminho);
        git(trab, 'commit', '--quiet', '-m', `semente ${caminho}`);
    }
    git(trab, 'push', '--quiet', 'origin', 'main');
}

function blobDe(conteudo: string) {
    const f = path.join(tmp, 'blob');
    fs.writeFileSync(f, dumpFalso(conteudo));
    return git(tmp, 'hash-object', f);
}

/** Tudo o que alguma ref do remoto ainda alcança: commits, árvores e blobs. */
const alcancavel = () => git(remoto, 'rev-list', '--objects', '--all');
const arvore = () => git(remoto, 'ls-tree', '-r', '--name-only', 'main').split('\n').filter(Boolean).sort();
const commits = () => git(remoto, 'rev-list', '--count', 'main');

describe('TASK-113 — o envio e a poda, contra um repositório git de verdade', () => {
    const agora = utc('2026-09-11T06:20:00Z');
    let dump: string;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'retencao-'));
        dump = path.join(tmp, 'dump.sql.gz');
        fs.writeFileSync(dump, dumpFalso('o de hoje'));
        // Como o repositório de produção em 2026-09-10: README, dumps diários, e um dia
        // gravado duas vezes.
        semearRemoto([
            ['README.md', '# backups\n'],
            ['backups/2026/09/2026-09-01.sql.gz', 'dia 01'],
            ['backups/2026/09/2026-09-06.sql.gz', 'dia 06'],
            ['backups/2026/09/2026-09-10.sql.gz', 'dia 10, primeira versão'],
            ['backups/2026/09/2026-09-10.sql.gz', 'dia 10, segunda versão'],
        ]);
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('BDD 5: o que sai da janela deixa de ser alcançável — inclusive a versão sobrescrita', async () => {
        const { enviarBackup } = await envio();
        const r = await enviarBackup({ remoto: remotoUrl, arquivoLocal: dump, agora, dias: 7, dirTrabalho: tmp });

        expect(r.caminho).toBe('backups/2026/09/2026-09-11T062000Z.sql.gz');
        expect(arvore()).toEqual([
            'README.md',
            'backups/2026/09/2026-09-06.sql.gz',
            'backups/2026/09/2026-09-10.sql.gz',
            'backups/2026/09/2026-09-11T062000Z.sql.gz',
        ]);
        const objetos = alcancavel();
        expect(objetos, 'o dump do dia 01 continua no histórico').not.toMatch(/2026-09-01/);
        expect(objetos, 'a primeira versão do dia 10 continua no histórico — a cópia escondida')
            .not.toContain(blobDe('dia 10, primeira versão'));
        expect(commits(), 'o histórico antigo ainda está pendurado em main').toBe('1');
    });

    it('BDD 5: o arquivo no repositório é, byte a byte, o dump verificado', async () => {
        const { enviarBackup } = await envio();
        const r = await enviarBackup({ remoto: remotoUrl, arquivoLocal: dump, agora, dias: 7, dirTrabalho: tmp });
        const noRemoto = execFileSync('git', ['show', `main:${r.caminho}`], { cwd: remoto });
        expect(Buffer.compare(noRemoto, fs.readFileSync(dump))).toBe(0);
    });

    it('BDD 6: retenção desconhecida não apaga nada, nem reescreve o histórico', async () => {
        const { enviarBackup } = await envio();
        const antes = Number(commits());
        await enviarBackup({ remoto: remotoUrl, arquivoLocal: dump, agora, dias: null, dirTrabalho: tmp });
        expect(arvore()).toContain('backups/2026/09/2026-09-01.sql.gz');
        expect(alcancavel()).toContain(blobDe('dia 10, primeira versão'));
        expect(Number(commits()), 'o histórico foi reescrito sem retenção conhecida').toBe(antes + 1);
    });

    it('BDD 7: se o remoto mudou depois do clone, o push forçado é recusado — não atropela', async () => {
        // Hoje há um só workflow escrevendo lá (e o `concurrency` o serializa). A
        // TASK-115 traz o segundo — a restauração grava um backup de segurança. Force
        // push sem lease apagaria em silêncio o que o outro acabou de guardar.
        const { enviarBackup } = await envio();
        const outro = path.join(tmp, 'outro');
        const empurrarConcorrente = () => {
            git(tmp, 'clone', '--quiet', remotoUrl, outro);
            git(outro, 'config', 'user.name', 'outro');
            git(outro, 'config', 'user.email', 'outro@example.invalid');
            fs.writeFileSync(path.join(outro, 'backups/2026/09/seguranca.sql.gz'), dumpFalso('backup de segurança'));
            git(outro, 'add', '.');
            git(outro, 'commit', '--quiet', '-m', 'backup de segurança');
            git(outro, 'push', '--quiet', 'origin', 'main');
        };
        await expect(enviarBackup({
            remoto: remotoUrl, arquivoLocal: dump, agora, dias: 7, dirTrabalho: tmp, depoisDoClone: empurrarConcorrente,
        })).rejects.toThrow();
        expect(arvore(), 'o push forçado apagou o que o outro tinha acabado de guardar')
            .toContain('backups/2026/09/seguranca.sql.gz');
    });

    it('BDD 4: dump local ausente ou vazio — recusa antes de tocar o remoto', async () => {
        const { enviarBackup } = await envio();
        const antes = alcancavel();
        await expect(enviarBackup({ remoto: remotoUrl, arquivoLocal: path.join(tmp, 'nao-existe.gz'), agora, dias: 7, dirTrabalho: tmp }))
            .rejects.toThrow(/dump/);
        fs.writeFileSync(path.join(tmp, 'vazio.gz'), '');
        await expect(enviarBackup({ remoto: remotoUrl, arquivoLocal: path.join(tmp, 'vazio.gz'), agora, dias: 7, dirTrabalho: tmp }))
            .rejects.toThrow(/dump/);
        expect(alcancavel()).toBe(antes);
    });

    it('BDD 8: o script do workflow — `--dias` vazio é retenção desconhecida', () => {
        // O que o YAML chama, do jeito que o YAML chama: processo de verdade, argumentos
        // de verdade. A agenda ilegível chega aqui como `--dias ""`.
        const rodar = (dias: string) => execFileSync(process.execPath,
            [path.resolve(RAIZ, 'db/enviar-backup.mjs'), '--arquivo', dump, '--dias', dias],
            { cwd: tmp, encoding: 'utf8', env: { ...process.env, BACKUP_REMOTO: remotoUrl, BACKUP_REPO: 'dono/privado' }, stdio: ['ignore', 'pipe', 'pipe'] });

        const saida = rodar('');
        expect(saida).toMatch(/^destino=dono\/privado:backups\/\d{4}\/\d{2}\/[\dT-]+Z\.sql\.gz$/m);
        expect(arvore(), 'apagou sem retenção conhecida').toContain('backups/2026/09/2026-09-01.sql.gz');

        rodar('7');
        expect(arvore()).not.toContain('backups/2026/09/2026-09-01.sql.gz');
        expect(commits()).toBe('1');
    });
});

describe('TASK-113 — o workflow poda pelo script, e só depois de verificar', () => {
    const yml = () => semComentarios('.github/workflows/backup.yml');
    const passos = () => yml().split(/\n\s*- (?=name:|uses:|run:)/);

    it('BDD 9: o envio é o script testado, não `git push` escrito no YAML', () => {
        expect(yml(), 'o envio não passa por db/enviar-backup.mjs').toMatch(/node db\/enviar-backup\.mjs/);
        expect(yml(), 'sobrou git push no YAML — orquestração irreversível sem teste').not.toMatch(/git push/);
        expect(yml(), 'o nome por dia sobrescreve o backup anterior do mesmo dia').not.toMatch(/%Y-%m-%d\)\.sql\.gz/);
    });

    it('BDD 9: a retenção vem da agenda lida pelo job `agenda`', () => {
        const y = yml();
        expect(y, 'o job agenda não expõe a retenção').toMatch(/retencao:\s*\$\{\{\s*steps\.decisao\.outputs\.retencao\s*\}\}/);
        expect(y, 'o envio não recebe a retenção da agenda').toMatch(/needs\.agenda\.outputs\.retencao/);
    });

    it('BDD 4: a poda vem DEPOIS da verificação, e nada a deixa rodar se a verificação falhar', () => {
        const ps = passos();
        const iVerif = ps.findIndex(p => /verify-dump-cli/.test(p));
        const iEnvio = ps.findIndex(p => /enviar-backup\.mjs/.test(p));
        expect(iVerif, 'passo de verificação não encontrado').toBeGreaterThan(-1);
        expect(iEnvio, 'a poda roda antes de o dump novo ser verificado').toBeGreaterThan(iVerif);
        for (const i of [iVerif, iEnvio]) {
            expect(ps[i], 'continue-on-error deixaria podar sem dump verificado').not.toMatch(/continue-on-error/);
            expect(ps[i], 'if: always() deixaria podar sem dump verificado').not.toMatch(/if:\s*always\(\)/);
        }
    });
});

describe('TASK-113 — o portão entrega a retenção ao workflow', () => {
    it('BDD 10: `decidir` devolve a retenção — também na execução manual', async () => {
        const { decidir } = await import('../db/agenda-backup.mjs');
        const c = new Client({ connectionString: TEST_DATABASE_URL });
        await c.connect();
        await c.query('BEGIN');
        try {
            await c.query(`INSERT INTO settings (key, value) VALUES ('backup_retencao_dias', '12')
                           ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
            expect((await decidir(c, { agora: utc('2099-01-01T08:40Z'), evento: 'schedule' })).retencao).toBe(12);
            // A execução manual também guarda um dump — e também poda.
            expect((await decidir(c, { agora: utc('2099-01-01T08:40Z'), evento: 'workflow_dispatch' })).retencao).toBe(12);
        } finally {
            await c.query('ROLLBACK');
            await c.end();
        }
    });

    it('BDD 10: agenda ilegível executa o backup, mas NÃO entrega retenção', () => {
        // Na dúvida, executa (TASK-112); na dúvida, não apaga (TASK-113). Um padrão de 7
        // dias aqui apagaria 23 dias de backups de quem configurou 30.
        const saida = execFileSync(process.execPath, [path.resolve(RAIZ, 'db/agenda-backup.mjs')], {
            encoding: 'utf8',
            env: { ...process.env, DATABASE_URL: 'postgresql://ninguem:x@127.0.0.1:1/nada', EVENTO: 'schedule' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        expect(saida).toMatch(/^executar=true$/m);
        expect(saida, 'agenda ilegível entregou uma retenção inventada').not.toMatch(/^retencao=\d/m);
    });
});

describe('TASK-113 — só ADMIN altera a retenção, e fica na trilha', () => {
    const comSessao = (papel: string | null) => {
        vi.resetModules();
        vi.doMock('next/headers', () => ({
            cookies: () => Promise.resolve({ get: () => (papel ? { value: 't' } : undefined) }),
            headers: () => Promise.resolve(new Headers()),
        }));
        vi.doMock('@/lib/session', () => ({
            verifySession: () => Promise.resolve(papel ? { id: 1, username: `test_${papel.toLowerCase()}`, role: papel } : null),
        }));
        return import('@/app/api/backups/agenda/route');
    };
    const post = (body: unknown) => new Request('http://x/api/backups/agenda', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });

    it('BDD 11: ADMIN grava a retenção, e a leitura a devolve', async () => {
        expect((await (await comSessao('ADMIN')).POST(post({ hora: 3, vezes: 1, dias: 14 }))).status).toBe(200);
        const corpo = await (await (await comSessao('ADMIN')).GET()).json();
        expect(corpo).toMatchObject({ hora: 3, vezes: 1, dias: 14 });
    });

    it('BDD 11: fora de 3–30, ou sem ela, 400 — e nada é gravado', async () => {
        await (await comSessao('ADMIN')).POST(post({ hora: 3, vezes: 1, dias: 9 }));
        for (const ruim of [{ hora: 3, vezes: 1, dias: 2 }, { hora: 3, vezes: 1, dias: 31 }, { hora: 3, vezes: 1, dias: '7' },
            { hora: 3, vezes: 1, dias: 7.5 }, { hora: 3, vezes: 1 }]) {
            expect((await (await comSessao('ADMIN')).POST(post(ruim))).status, JSON.stringify(ruim)).toBe(400);
        }
        const corpo = await (await (await comSessao('ADMIN')).GET()).json();
        expect(corpo.dias, 'um valor recusado chegou ao banco').toBe(9);
    });

    it('BDD 11: GESTOR não altera', async () => {
        expect((await (await comSessao('GESTOR')).POST(post({ hora: 3, vezes: 1, dias: 30 }))).status).toBe(403);
    });

    it('BDD 11: a trilha diz de quanto para quanto foi a retenção', async () => {
        // Baixar a retenção APAGA backups no próximo envio. A trilha tem de dizer quem
        // fez isso, e com que números.
        await (await comSessao('ADMIN')).POST(post({ hora: 3, vezes: 1, dias: 20 }));
        await (await comSessao('ADMIN')).POST(post({ hora: 3, vezes: 1, dias: 5 }));
        const { queryOne } = await import('@/lib/pg');
        const ultima = await queryOne<{ details: string }>(
            `SELECT details FROM action_logs WHERE action = 'BACKUP_AGENDA_ALTERADA' ORDER BY id DESC LIMIT 1`);
        expect(ultima!.details).toMatch(/20 dias/);
        expect(ultima!.details).toMatch(/5 dias/);
    });
});

describe('TASK-113 — a tela oferece a retenção, porque agora ela é aplicada', () => {
    const tela = () => semComentarios('src/app/settings/SettingsClient.tsx');

    it('BDD 12: há o campo de dias, gravado pela rota da agenda', () => {
        expect(tela(), 'sem campo de retenção').toMatch(/id="bkp-dias"/);
        expect(tela()).toMatch(/LIMITES\.dias/);
    });

    it('BDD 12: a tela diz que os antigos são APAGADOS, inclusive do histórico — e não há volta', () => {
        // "Removidos" sozinho deixaria o ADMIN achar que há lixeira. Não há.
        const t = tela();
        expect(t).toMatch(/apagad/i);
        expect(t).toMatch(/hist[óo]rico/i);
    });

    it('BDD 12: o campo só existe porque o workflow poda — e a guarda confere os dois lados', () => {
        if (/id="bkp-dias"/.test(tela())) {
            expect(semComentarios('.github/workflows/backup.yml'), 'a tela oferece retenção que o workflow não aplica')
                .toMatch(/node db\/enviar-backup\.mjs/);
        }
    });
});
