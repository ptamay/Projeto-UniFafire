import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execute, queryOne, withTransaction } from '@/lib/pg';
import { withMaintenanceMode } from '@/lib/db-maintenance';

// TASK-114 (CR Tipo D · ADR-024, decisão 3) — backup manual pela tela.
//
// ## O que o botão faz, e o que ele NÃO faz
//
// Ele não faz backup. Quem faz é o `.github/workflows/backup.yml`, o mesmo do
// agendamento, com a mesma verificação por restauração e a mesma retenção. O botão só
// DISPARA o workflow pela API do GitHub (`workflow_dispatch`) — e o portão da agenda
// (TASK-112) deixa execução manual sempre passar.
//
// Por isso a aplicação passa a ter uma credencial nova: um token fine-grained, SÓ com
// `Actions: write` neste repositório, criado pelo usuário e guardado como secret na
// Vercel. É a superfície que o ADR-013 recusou, agora aceita pelo ADR-024 — e a razão
// de a rota ser exclusiva de ADMIN (§3.2) e de cada disparo, ou falha, ir para a trilha.
//
// ## O critério do ADR-013 continua valendo
//
// Sem o token configurado, o botão NÃO aparece — controle que não funciona é o controle
// inerte que o ADR-013 tirou da tela. O ADMIN vê, no lugar, o que falta configurar.
//
// ## "Estado lido do backup_runs"
//
// O disparo volta em segundos, mas o backup leva minutos. Entre um e outro, a tela diz
// "solicitado, aguardando" — e deixa de dizer quando uma execução nova aparece em
// `backup_runs`, que é o fato. Enquanto há solicitação pendente, um segundo clique é
// recusado: cada execução gera um dump com a PII de todo mundo, guardado por dias.

const RAIZ = process.cwd();
const ler = (f: string) => fs.readFileSync(path.resolve(RAIZ, f), 'utf-8');
const semComentarios = (f: string) => ler(f)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(\/\/|#).*$/gm, '');

const TOKEN = 'github_pat_TESTE_nao_e_um_token_de_verdade_0123456789';
const REPO = 'dono/repositorio';
const ROTA = '@/app/api/backups/executar/route';

const comSessao = (papel: string | null) => {
    vi.resetModules();
    vi.doMock('next/headers', () => ({
        cookies: () => Promise.resolve({ get: () => (papel ? { value: 't' } : undefined) }),
        headers: () => Promise.resolve(new Headers()),
    }));
    vi.doMock('@/lib/session', () => ({
        verifySession: () => Promise.resolve(papel ? { id: 1, username: `test_${papel.toLowerCase()}`, role: papel } : null),
    }));
    return import(ROTA);
};

/** Simula a API do GitHub. 204 é a resposta de sucesso do `workflow_dispatch`. */
function githubResponde(status: number) {
    const fetchFalso = vi.fn(async () => new Response(status === 204 ? null : JSON.stringify({ message: 'x' }), { status }));
    vi.stubGlobal('fetch', fetchFalso);
    return fetchFalso;
}

async function limparBackupRuns() {
    await withTransaction(async (tx) => {
        // `backup_runs` é imutável por trigger (TASK-078); o bypass transacional é o
        // mesmo que `tests/backup-reliability.test.ts` usa para isolar cenários.
        await tx.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
        await tx.execute('DELETE FROM backup_runs');
    });
}

const contar = async (acao: string) => (await queryOne<{ n: number }>(
    'SELECT count(*)::int AS n FROM action_logs WHERE action = $1', [acao]))!.n;

beforeEach(async () => {
    await limparBackupRuns();
    // `action_logs` só é zerada por arquivo (tests/setup.ts). Sem isto, o pedido de um
    // cenário deixaria o seguinte "pendente" — e recusado com 409 por motivo alheio.
    await withMaintenanceMode(tx => tx.execute(`DELETE FROM action_logs WHERE action LIKE 'BACKUP_MANUAL_%'`));
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

describe('TASK-114 — só ADMIN dispara (§3.2)', () => {
    it('BDD 1: sem sessão 401; GESTOR 403 — ler e disparar; e o GitHub nem é chamado', async () => {
        const fetchFalso = githubResponde(204);
        expect((await (await comSessao(null)).GET()).status).toBe(401);
        expect((await (await comSessao(null)).POST()).status).toBe(401);
        expect((await (await comSessao('GESTOR')).GET()).status).toBe(403);
        expect((await (await comSessao('GESTOR')).POST()).status).toBe(403);
        expect(fetchFalso).not.toHaveBeenCalled();
    });
});

describe('TASK-114 — o disparo', () => {
    it('BDD 2: ADMIN dispara o workflow de backup na main, com o token, e recebe 202', async () => {
        const fetchFalso = githubResponde(204);
        const res = await (await comSessao('ADMIN')).POST();
        expect(res.status).toBe(202);

        expect(fetchFalso).toHaveBeenCalledTimes(1);
        const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(`https://api.github.com/repos/${REPO}/actions/workflows/backup.yml/dispatches`);
        expect(init.method).toBe('POST');
        expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
        expect(JSON.parse(String(init.body))).toEqual({ ref: 'main' });
    });

    it('BDD 3: o disparo entra na trilha, com quem pediu', async () => {
        githubResponde(204);
        const antes = await contar('BACKUP_MANUAL_SOLICITADO');
        await (await comSessao('ADMIN')).POST();
        expect(await contar('BACKUP_MANUAL_SOLICITADO'), 'o backup foi disparado e ninguém ficou sabendo quem pediu')
            .toBe(antes + 1);
        const linha = await queryOne<{ username: string }>(
            `SELECT username FROM action_logs WHERE action = 'BACKUP_MANUAL_SOLICITADO' ORDER BY id DESC LIMIT 1`);
        expect(linha!.username).toBe('test_admin');
    });

    it('BDD 4: enquanto o backup pedido não termina, a tela diz "solicitado", e um segundo clique é recusado', async () => {
        const fetchFalso = githubResponde(204);
        await (await comSessao('ADMIN')).POST();

        const estado = await (await (await comSessao('ADMIN')).GET()).json();
        expect(estado).toMatchObject({ configurado: true, pendente: true });
        expect(estado.solicitacao.por).toBe('test_admin');

        const segundo = await (await comSessao('ADMIN')).POST();
        expect(segundo.status, 'dois cliques, dois dumps com a PII de todo mundo').toBe(409);
        expect(fetchFalso).toHaveBeenCalledTimes(1);
    });

    it('BDD 4: quando uma execução nova aparece em backup_runs, deixa de estar pendente', async () => {
        githubResponde(204);
        await (await comSessao('ADMIN')).POST();
        await execute(`INSERT INTO backup_runs (ran_at, succeeded, size_bytes, destination)
                       VALUES (now() + interval '1 second', true, 1, 'teste')`);
        const estado = await (await (await comSessao('ADMIN')).GET()).json();
        expect(estado.pendente, 'o backup terminou e a tela continua dizendo "aguardando"').toBe(false);
        expect((await (await comSessao('ADMIN')).POST()).status).toBe(202);
    });

    it('BDD 4: solicitação sem resposta por mais de uma hora deixa de travar o botão', async () => {
        // Se o GitHub engolir o disparo, o ADMIN não pode ficar sem botão para sempre.
        const { estaPendente, PENDENTE_POR_MINUTOS } = await import('@/lib/backup-manual');
        const agora = new Date('2026-09-13T12:00:00Z');
        const solicitadoEm = new Date(agora.getTime() - (PENDENTE_POR_MINUTOS + 1) * 60_000);
        expect(estaPendente({ solicitadoEm, ultimoBackupEm: null, agora })).toBe(false);
        expect(estaPendente({ solicitadoEm: new Date(agora.getTime() - 5 * 60_000), ultimoBackupEm: null, agora })).toBe(true);
        // Uma falha registrada também encerra a espera: o backup rodou, só não prestou —
        // e isso aparece em "Último backup", com a mensagem.
        expect(estaPendente({
            solicitadoEm: new Date(agora.getTime() - 5 * 60_000), ultimoBackupEm: new Date(agora.getTime() - 60_000), agora,
        })).toBe(false);
    });
});

describe('TASK-114 — quando o GitHub recusa', () => {
    it('BDD 5: token recusado → 502 que diz o que conferir, e a falha vai para a trilha', async () => {
        githubResponde(401);
        const antes = await contar('BACKUP_MANUAL_FALHOU');
        const res = await (await comSessao('ADMIN')).POST();
        expect(res.status).toBe(502);
        expect((await res.json()).error).toMatch(/token/i);
        expect(await contar('BACKUP_MANUAL_FALHOU')).toBe(antes + 1);
        // E uma falha não deixa "pendente" — não houve backup pedido de verdade.
        expect((await (await (await comSessao('ADMIN')).GET()).json()).pendente).toBe(false);
    });

    it('BDD 5: sem permissão ou repositório errado (403/404) → 502 que diz isso', async () => {
        for (const status of [403, 404]) {
            githubResponde(status);
            const res = await (await comSessao('ADMIN')).POST();
            expect(res.status, String(status)).toBe(502);
            expect((await res.json()).error, String(status)).toMatch(/permiss|reposit/i);
        }
    });

    it('BDD 5: GitHub fora do ar → 502, sem estourar', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
        const res = await (await comSessao('ADMIN')).POST();
        expect(res.status).toBe(502);
    });

    it('BDD 6: o token nunca aparece na resposta nem no log', async () => {
        githubResponde(401);
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await (await comSessao('ADMIN')).POST();
        expect(await res.text()).not.toContain(TOKEN);
        expect(JSON.stringify(erro.mock.calls)).not.toContain(TOKEN);
        const trilha = await queryOne<{ t: string }>(`SELECT string_agg(coalesce(details, ''), ' ') AS t FROM action_logs`);
        expect(trilha!.t ?? '').not.toContain(TOKEN);
    });
});

describe('TASK-114 — sem token, sem botão (critério do ADR-013)', () => {
    it('BDD 7: sem configuração, o estado diz "não configurado" e o disparo não chama o GitHub', async () => {
        vi.stubEnv('BACKUP_DISPARO_TOKEN', '');
        const fetchFalso = githubResponde(204);
        expect(await (await (await comSessao('ADMIN')).GET()).json()).toMatchObject({ configurado: false });
        expect((await (await comSessao('ADMIN')).POST()).status).toBe(503);
        expect(fetchFalso).not.toHaveBeenCalled();
    });

    it('BDD 7: repositório fora do formato "dono/repo" também é "não configurado"', async () => {
        // Uma URL colada no lugar do nome montaria outro endereço de API — e o token iria
        // para lá. Formato estrito, e na dúvida não dispara.
        for (const ruim of ['https://github.com/dono/repo', 'dono', 'dono/repo/extra', 'dono/re po', '../x/y']) {
            vi.stubEnv('BACKUP_DISPARO_REPO', ruim);
            const fetchFalso = githubResponde(204);
            expect((await (await (await comSessao('ADMIN')).GET()).json()).configurado, ruim).toBe(false);
            expect(fetchFalso).not.toHaveBeenCalled();
        }
    });

    it('BDD 7: a tela só mostra o botão quando o estado diz "configurado"', () => {
        const tela = semComentarios('src/app/(app)/settings/SettingsClient.tsx');
        expect(tela, 'a tela não consulta o estado do backup manual').toMatch(/\/api\/backups\/executar/);
        expect(tela, 'o botão não depende de estar configurado').toMatch(/configurado/);
        expect(tela, 'sem botão de backup manual').toMatch(/Fazer backup agora/);
        // Guarda de dois lados, no molde da agenda (TASK-112) e da retenção (TASK-113): o
        // botão só pode estar na tela se a rota que ele chama dispara o workflow de fato —
        // o "Gerar Backup Agora" da TASK-082 chamava um POST que respondia 503 para sempre.
        expect(semComentarios('src/lib/backup-manual.ts'), 'o botão existe, mas nada dispara o workflow')
            .toMatch(/\/actions\/workflows\/backup\.yml\/dispatches/);
    });

    it('BDD 7: as variáveis estão documentadas no .env.example, sem valor', () => {
        // CRLF → LF: com autocrlf (Windows), o `$` da regex não casaria antes do `\r`.
        const exemplo = ler('.env.example').replace(/\r\n/g, '\n');
        expect(exemplo).toMatch(/^#?\s*BACKUP_DISPARO_TOKEN=""?$/m);
        expect(exemplo).toMatch(/^#?\s*BACKUP_DISPARO_REPO=/m);
        expect(exemplo, 'token com cara de verdade no exemplo').not.toMatch(/github_pat_[A-Za-z0-9]{10,}/);
    });
});
