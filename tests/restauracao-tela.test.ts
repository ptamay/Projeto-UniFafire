import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execute, queryOne, withTransaction } from '@/lib/pg';
import { withMaintenanceMode } from '@/lib/db-maintenance';

// TASK-115 (CR Tipo D · ADR-024, decisão 4) — ciclo 4: a rota e a tela.
//
// ## A lista
//
// Só entra o que dá para restaurar de verdade: backup VERIFICADO (`backup_runs`), dentro
// da janela de retenção (o que é mais velho foi apagado do repositório privado —
// TASK-113) e feito DEPOIS da última migration aplicada (antes dela, o schema do dump é
// outro e o motor recusaria). Os que ficam de fora por schema são contados, para a tela
// dizer por que a lista é curta. O workflow confere tudo de novo — a lista é conveniência,
// não a garantia.
//
// ## O pedido
//
// Só ADMIN (§3.2), com a palavra RESTAURAR (decisão do usuário), e só um arquivo que esteja
// NA LISTA — o servidor confere de novo; o que o navegador manda não é prova de nada. A
// entrada na trilha vai ANTES do disparo (§3.5: "gera entrada imutável no log de auditoria
// ANTES de executar").

const RAIZ = process.cwd();
const ler = (f: string) => fs.readFileSync(path.resolve(RAIZ, f), 'utf-8');
const semComentarios = (f: string) => ler(f)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(\/\/|#).*$/gm, '');

const TOKEN = 'github_pat_TESTE_nao_e_um_token_de_verdade_0123456789';
const REPO = 'dono/repositorio';
const PRIVADO = 'dono/privado';

const comSessao = (papel: string | null) => {
    vi.resetModules();
    vi.doMock('next/headers', () => ({
        cookies: () => Promise.resolve({ get: () => (papel ? { value: 't' } : undefined) }),
        headers: () => Promise.resolve(new Headers()),
    }));
    vi.doMock('@/lib/session', () => ({
        verifySession: () => Promise.resolve(papel ? { id: 1, username: `test_${papel.toLowerCase()}`, role: papel } : null),
    }));
    return import('@/app/api/backups/restaurar/route');
};

const post = (body: unknown) => new Request('http://x/api/backups/restaurar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

function githubResponde(status: number, aoChamar?: () => Promise<void>) {
    const f = vi.fn(async () => {
        await aoChamar?.();
        return new Response(status === 204 ? null : '{}', { status });
    });
    vi.stubGlobal('fetch', f);
    return f;
}

/** Um backup verificado de N horas atrás, com o nome que o envio lhe daria. */
async function backup(horasAtras: number, opcoes: { ok?: boolean; destino?: string } = {}) {
    const em = new Date(Date.now() - horasAtras * 3600_000);
    const hms = em.toISOString().slice(11, 19).replace(/:/g, '');
    const arquivo = `backups/${em.toISOString().slice(0, 4)}/${em.toISOString().slice(5, 7)}/${em.toISOString().slice(0, 10)}T${hms}Z.sql.gz`;
    await execute(`INSERT INTO backup_runs (ran_at, succeeded, size_bytes, error, destination) VALUES ($1, $2, 8106, $3, $4)`,
        [em.toISOString(), opcoes.ok ?? true, opcoes.ok === false ? 'falhou' : null, opcoes.destino ?? `${PRIVADO}:${arquivo}`]);
    return arquivo;
}

const contar = async (acao: string) => (await queryOne<{ n: number }>(
    'SELECT count(*)::int AS n FROM action_logs WHERE action = $1', [acao]))!.n;

let ultimaMigracao: string;

beforeEach(async () => {
    await withTransaction(async (tx) => {
        await tx.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
        await tx.execute('DELETE FROM backup_runs');
    });
    await withMaintenanceMode(tx => tx.execute(`DELETE FROM action_logs WHERE action LIKE 'RESTAURACAO_%' OR action = 'BACKUP_RESTAURADO'`));
    await execute(`DELETE FROM settings WHERE key = 'backup_retencao_dias'`);
    // A "última migration" foi há 30 h: só backup feito depois dela é restaurável. TODAS as
    // linhas recuam — a suíte aplicou todas agora, e o que conta é o `max(aplicada_em)`.
    ultimaMigracao = new Date(Date.now() - 30 * 3600_000).toISOString();
    await execute(`UPDATE migracoes_aplicadas SET aplicada_em = $1`, [ultimaMigracao]);
    vi.stubEnv('BACKUP_DISPARO_TOKEN', TOKEN);
    vi.stubEnv('BACKUP_DISPARO_REPO', REPO);
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('@/lib/session');
    vi.doUnmock('next/headers');
});

describe('TASK-115 — só ADMIN (§3.2, §3.5)', () => {
    it('BDD 13: sem sessão 401; GESTOR 403 — listar e restaurar; e o GitHub nem é chamado', async () => {
        const f = githubResponde(204);
        const arquivo = await backup(2);
        expect((await (await comSessao(null)).GET()).status).toBe(401);
        expect((await (await comSessao(null)).POST(post({ arquivo, confirmacao: 'RESTAURAR' }))).status).toBe(401);
        expect((await (await comSessao('GESTOR')).GET()).status).toBe(403);
        expect((await (await comSessao('GESTOR')).POST(post({ arquivo, confirmacao: 'RESTAURAR' }))).status).toBe(403);
        expect(f).not.toHaveBeenCalled();
    });
});

describe('TASK-115 — a lista só tem o que dá para restaurar', () => {
    it('BDD 14: verificados, dentro da retenção, depois da última migration — do mais novo ao mais velho', async () => {
        const novo = await backup(2);
        const ontem = await backup(20);
        await backup(3, { ok: false });                          // falhou
        await backup(40);                                        // antes da última migration
        await backup(24 * 12);                                   // fora da retenção (7 dias) — e antes da migration
        await backup(1, { destino: 'dono/privado:../../etc/passwd' });  // nome fora do padrão

        const corpo = await (await (await comSessao('ADMIN')).GET()).json();
        expect(corpo.restauraveis.map((r: { arquivo: string }) => r.arquivo)).toEqual([novo, ontem]);
        // Só conta o que AINDA EXISTE e ficou de fora pelo schema (o de 40 h). O de 12 dias
        // já foi apagado pela retenção — não é "oculto", não existe.
        expect(corpo.ocultosPorSchema, 'a tela não explica por que a lista é curta').toBe(1);
        expect(corpo.restauraveis[0]).toMatchObject({ tamanho: 8106 });
    });

    it('BDD 14: fora da retenção configurada não aparece — o dump já foi apagado', async () => {
        await execute(`UPDATE migracoes_aplicadas SET aplicada_em = now() - interval '30 days'`);
        await execute(`INSERT INTO settings (key, value) VALUES ('backup_retencao_dias', '3')`);
        const recente = await backup(2);
        await backup(24 * 5);
        const corpo = await (await (await comSessao('ADMIN')).GET()).json();
        expect(corpo.restauraveis.map((r: { arquivo: string }) => r.arquivo)).toEqual([recente]);
    });
});

describe('TASK-115 — o pedido', () => {
    it('BDD 15: sem a palavra RESTAURAR, 400 — e nada é disparado nem registrado', async () => {
        const f = githubResponde(204);
        const arquivo = await backup(2);
        for (const confirmacao of [undefined, '', 'restaurar', 'RESTAURA', 'RESTAURAR ']) {
            const res = await (await comSessao('ADMIN')).POST(post({ arquivo, confirmacao }));
            expect(res.status, String(confirmacao)).toBe(400);
        }
        expect(f).not.toHaveBeenCalled();
        expect(await contar('RESTAURACAO_SOLICITADA')).toBe(0);
    });

    it('BDD 15: arquivo que não está na lista é recusado pelo servidor — o navegador não prova nada', async () => {
        const f = githubResponde(204);
        await backup(2);
        const antigo = await backup(40);              // existe, mas é de antes da última migration
        for (const arquivo of [antigo, 'backups/2026/09/2026-09-01.sql.gz', '../../etc/passwd']) {
            const res = await (await comSessao('ADMIN')).POST(post({ arquivo, confirmacao: 'RESTAURAR' }));
            expect(res.status, arquivo).toBe(400);
        }
        expect(f).not.toHaveBeenCalled();
    });

    it('BDD 16: a trilha registra o pedido ANTES do disparo, e o workflow de restauração recebe arquivo e quem pediu', async () => {
        const arquivo = await backup(2);
        let registradoAntes = false;
        const f = githubResponde(204, async () => { registradoAntes = (await contar('RESTAURACAO_SOLICITADA')) === 1; });
        const res = await (await comSessao('ADMIN')).POST(post({ arquivo, confirmacao: 'RESTAURAR' }));
        expect(res.status).toBe(202);
        expect(registradoAntes, '§3.5: a entrada na trilha tem de existir ANTES de executar').toBe(true);

        const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(`https://api.github.com/repos/${REPO}/actions/workflows/restaurar.yml/dispatches`);
        expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
        expect(JSON.parse(String(init.body))).toEqual({ ref: 'main', inputs: { arquivo, pedido_por: 'test_admin' } });
    });

    it('BDD 16: enquanto a restauração não termina, pendente — e um segundo pedido é recusado', async () => {
        const arquivo = await backup(2);
        const f = githubResponde(204);
        await (await comSessao('ADMIN')).POST(post({ arquivo, confirmacao: 'RESTAURAR' }));
        const estado = await (await (await comSessao('ADMIN')).GET()).json();
        expect(estado.pendente).toBe(true);
        expect(estado.ultima).toMatchObject({ acao: 'RESTAURACAO_SOLICITADA', por: 'test_admin' });
        expect((await (await comSessao('ADMIN')).POST(post({ arquivo, confirmacao: 'RESTAURAR' }))).status).toBe(409);
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('BDD 16: o workflow registra o fim na trilha, e a tela deixa de dizer "em andamento"', async () => {
        const arquivo = await backup(2);
        githubResponde(204);
        await (await comSessao('ADMIN')).POST(post({ arquivo, confirmacao: 'RESTAURAR' }));
        await execute(`INSERT INTO action_logs (username, action, target, details, timestamp)
                       VALUES ('test_admin', 'BACKUP_RESTAURADO', 'backup', $1, now() + interval '1 second')`, [arquivo]);
        const estado = await (await (await comSessao('ADMIN')).GET()).json();
        expect(estado.pendente).toBe(false);
        expect(estado.ultima).toMatchObject({ acao: 'BACKUP_RESTAURADO' });
    });

    it('BDD 17: o GitHub recusa → 502, e a trilha fecha o pedido com a falha', async () => {
        const arquivo = await backup(2);
        githubResponde(401);
        const res = await (await comSessao('ADMIN')).POST(post({ arquivo, confirmacao: 'RESTAURAR' }));
        expect(res.status).toBe(502);
        expect(await contar('RESTAURACAO_SOLICITADA')).toBe(1);
        expect(await contar('RESTAURACAO_FALHOU')).toBe(1);
        expect((await (await (await comSessao('ADMIN')).GET()).json()).pendente).toBe(false);
    });

    it('BDD 17: sem o token configurado, 503 — e a lista diz "não configurado"', async () => {
        vi.stubEnv('BACKUP_DISPARO_TOKEN', '');
        const f = githubResponde(204);
        const arquivo = await backup(2);
        expect((await (await (await comSessao('ADMIN')).GET()).json()).configurado).toBe(false);
        expect((await (await comSessao('ADMIN')).POST(post({ arquivo, confirmacao: 'RESTAURAR' }))).status).toBe(503);
        expect(f).not.toHaveBeenCalled();
    });
});

describe('TASK-115 — a aplicação e o workflow falam a mesma língua', () => {
    it('BDD 18: os nomes das ações na trilha e o padrão de nome de backup são os do motor', async () => {
        // `src/` não pode importar de `db/` (db/ nem sobe para a Vercel). Duplicar é o
        // preço; divergir em silêncio seria a tela esperando um fim que nunca chega.
        const app = await import('@/lib/restauracao');
        const motor = await import('../db/restaurar-backup.mjs');
        const envio = await import('../db/enviar-backup.mjs');
        expect(app.ACOES_DO_FIM).toEqual(expect.arrayContaining(Object.values(motor.ACOES).filter(a => a !== motor.ACOES.ensaiado)));
        expect(app.NOME_DE_BACKUP.source).toBe(envio.NOME_DE_BACKUP.source);
    });
});

describe('TASK-115 — a tela', () => {
    const tela = () => semComentarios('src/app/settings/SettingsClient.tsx');

    it('BDD 19: lista, botão "Restaurar…" e o modal que exige digitar RESTAURAR', () => {
        const t = tela();
        expect(t).toMatch(/\/api\/backups\/restaurar/);
        expect(t).toMatch(/id="restaurar-backup"/);
        expect(t).toMatch(/Restaurar…/);
        expect(t).toMatch(/exigirTexto="RESTAURAR"/);
    });

    it('BDD 19: o modal diz a data e que as SENHAS voltam — e que há backup de segurança antes', () => {
        const t = tela();
        expect(t).toMatch(/[Ss]enhas/);
        expect(t).toMatch(/backup de segurança/);
        expect(t).toMatch(/trilha de auditoria/);
    });

    it('BDD 19: o modal só confirma depois de digitar a palavra — e sem ela, é o modal de sempre', async () => {
        const { default: ConfirmModal } = await import('@/app/components/ConfirmModal');
        const props = { isOpen: true, title: 'T', message: 'M', onConfirm: () => {}, onCancel: () => {}, confirmText: 'Restaurar' };
        const exigindo = renderToStaticMarkup(createElement(ConfirmModal, { ...props, exigirTexto: 'RESTAURAR' }));
        expect(exigindo, 'sem campo para digitar').toMatch(/<input/);
        expect(exigindo, 'o botão confirma sem a palavra').toMatch(/<button[^>]*disabled[^>]*>Restaurar<\/button>/);
        const comum = renderToStaticMarkup(createElement(ConfirmModal, props));
        expect(comum, 'os outros modais ganharam um campo').not.toMatch(/<input/);
        expect(comum).not.toMatch(/<button[^>]*disabled[^>]*>Restaurar<\/button>/);
    });
});
