import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './pg-test-config';

// TASK-112 (CR Tipo D · ADR-024) — a agenda do backup volta à tela, e desta vez é lida.
//
// ## Por que "desta vez"
//
// O ADR-013 tirou da tela o horário e a retenção do backup porque eram INERTES: o
// backup virou `pg_dump` no GitHub Actions com agenda fixa no YAML, e os campos
// gravavam em `settings` linhas que ninguém lia (`backup_time`,
// `backup_retention_count`, órfãs até hoje). O critério era "mostrar o que é verdade".
// Ele é o que permite a volta — se o workflow LER o que a tela grava.
//
// ## Como o workflow passa a obedecer
//
// O `cron` do Actions é fixo no arquivo. O workflow roda de hora em hora, e um job
// curto decide se há backup a fazer.
//
// ## Por que o portão não pergunta "é a hora?"
//
// Porque o GitHub ATRASA agendas sob carga — de minutos a mais de uma hora. Se o
// disparo das 03:00 sai às 04:05, um portão que compara a hora pula o dia inteiro. O
// portão pergunta: **há um horário vencido sem backup bem-sucedido depois dele?** Isso
// recupera disparo atrasado ou perdido, e não duplica o que já foi feito.
//
// ## O que NÃO entra aqui
//
// A retenção. Ela só é APLICADA na TASK-113 (a poda do repositório privado); um campo
// gravado que nada obedece seria exatamente o controle inerte do ADR-013.

const RAIZ = process.cwd();
const ler = (f: string) => fs.readFileSync(path.resolve(RAIZ, f), 'utf-8');
const semComentarios = (f: string) => ler(f)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(\/\/|#).*$/gm, '');

const politica = () => import('@/lib/agenda-backup.mjs');
const utc = (s: string) => new Date(s);

afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/lib/session');
    vi.doUnmock('next/headers');
});

describe('TASK-112 — a agenda é validada na escrita E na leitura', () => {
    it('BDD 1: sem configuração, o padrão: 03:00, uma vez por dia', async () => {
        const { lerAgenda } = await politica();
        expect(lerAgenda({})).toMatchObject({ hora: 3, vezes: 1 });
    });

    it('BDD 1: valor herdado inválido cai no padrão, campo a campo', async () => {
        // Lição da Sprint 24: um `"30"` herdado de carga sintética manteve o logout
        // automático inerte em produção, porque o POST validava e a leitura não.
        const { lerAgenda, CHAVES } = await politica();
        expect(lerAgenda({ [CHAVES.hora]: '24', [CHAVES.vezes]: '2' })).toMatchObject({ hora: 3, vezes: 2 });
        expect(lerAgenda({ [CHAVES.hora]: '7', [CHAVES.vezes]: '0' })).toMatchObject({ hora: 7, vezes: 1 });
        expect(lerAgenda({ [CHAVES.hora]: 'abc', [CHAVES.vezes]: '5' })).toMatchObject({ hora: 3, vezes: 1 });
        expect(lerAgenda({ [CHAVES.hora]: '3.5', [CHAVES.vezes]: '1' })).toMatchObject({ hora: 3, vezes: 1 });
    });

    it('BDD 1: nunca menos de uma vez por dia — é o RPO de 24 h da §4.3', async () => {
        const { lerAgenda, LIMITES } = await politica();
        expect(LIMITES.vezes[0]).toBe(1);
        expect(lerAgenda({ backup_vezes_por_dia: '-1' }).vezes).toBe(1);
    });

    it('BDD 1: as vezes do dia saem espaçadas igualmente a partir da hora', async () => {
        const { horariosDoDia } = await politica();
        expect(horariosDoDia({ hora: 3, vezes: 1 })).toEqual([3]);
        expect(horariosDoDia({ hora: 3, vezes: 2 })).toEqual([3, 15]);
        expect(horariosDoDia({ hora: 3, vezes: 3 })).toEqual([3, 11, 19]);
        expect(horariosDoDia({ hora: 22, vezes: 4 })).toEqual([4, 10, 16, 22]);
    });
});

describe('TASK-112 — o portão: há horário vencido sem backup depois dele?', () => {
    // Horário de Recife = UTC−3, o ano inteiro (sem horário de verão).
    const agenda = { hora: 3, vezes: 1 };

    it('BDD 2: passou das 03:00 e o último backup é de ontem → executa', async () => {
        const { deveExecutar } = await politica();
        expect(deveExecutar({ agora: utc('2026-09-11T06:10Z'), agenda, ultimoSucesso: utc('2026-09-10T17:49Z') }).executar).toBe(true);
    });

    it('BDD 2: já houve backup depois das 03:00 de hoje → não executa de novo', async () => {
        const { deveExecutar } = await politica();
        expect(deveExecutar({ agora: utc('2026-09-11T07:10Z'), agenda, ultimoSucesso: utc('2026-09-11T06:08Z') }).executar).toBe(false);
    });

    it('BDD 2: o GitHub atrasou o disparo para depois da hora → executa mesmo assim', async () => {
        // O caso que um portão "é a hora?" perderia: às 04:20 a hora já não é 3.
        const { deveExecutar } = await politica();
        expect(deveExecutar({ agora: utc('2026-09-11T07:20Z'), agenda, ultimoSucesso: utc('2026-09-10T06:30Z') }).executar).toBe(true);
    });

    it('BDD 2: ainda não chegou a hora de hoje, e a de ontem foi cumprida → não executa', async () => {
        const { deveExecutar } = await politica();
        expect(deveExecutar({ agora: utc('2026-09-11T05:30Z'), agenda, ultimoSucesso: utc('2026-09-10T06:30Z') }).executar).toBe(false);
    });

    it('BDD 2: nunca houve backup → executa', async () => {
        const { deveExecutar } = await politica();
        expect(deveExecutar({ agora: utc('2026-09-11T05:30Z'), agenda, ultimoSucesso: null }).executar).toBe(true);
    });

    it('BDD 2: duas vezes por dia — às 15:30 com backup só das 03:00 → executa', async () => {
        const { deveExecutar } = await politica();
        expect(deveExecutar({
            agora: utc('2026-09-11T18:30Z'), agenda: { hora: 3, vezes: 2 }, ultimoSucesso: utc('2026-09-11T06:30Z'),
        }).executar).toBe(true);
    });

    it('BDD 2: o script do workflow decide lendo o banco — e execução manual sempre passa', async () => {
        const { decidir } = await import('../db/agenda-backup.mjs');
        const c = new Client({ connectionString: TEST_DATABASE_URL });
        await c.connect();
        await c.query('BEGIN');
        try {
            // Tudo dentro de uma transação desfeita no fim: `backup_runs` é imutável
            // (trigger), e uma linha de teste ficaria para os outros arquivos.
            await c.query(`INSERT INTO settings (key, value) VALUES ('backup_hora', '5'), ('backup_vezes_por_dia', '1')
                           ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
            await c.query(`INSERT INTO backup_runs (ran_at, succeeded, size_bytes, destination)
                           VALUES ('2099-01-01T08:30Z', true, 1, 'teste')`);
            // 05:00 de Recife = 08:00Z. Às 08:40Z o backup das 08:30Z já cumpriu.
            expect((await decidir(c, { agora: utc('2099-01-01T08:40Z'), evento: 'schedule' })).executar).toBe(false);
            // No dia seguinte, depois das 05:00, não há backup depois do horário.
            expect((await decidir(c, { agora: utc('2099-01-02T09:00Z'), evento: 'schedule' })).executar).toBe(true);
            // `workflow_dispatch` é alguém pedindo — nunca é recusado pela agenda.
            expect((await decidir(c, { agora: utc('2099-01-01T08:40Z'), evento: 'workflow_dispatch' })).executar).toBe(true);
        } finally {
            await c.query('ROLLBACK');
            await c.end();
        }
    });
});

describe('TASK-112 — o workflow obedece à agenda', () => {
    const yml = () => semComentarios('.github/workflows/backup.yml');

    it('BDD 3: roda de hora em hora', () => {
        const cron = yml().match(/cron:\s*'([^']+)'/)?.[1] ?? '';
        const [, hora] = cron.split(/\s+/);
        expect(hora, `agenda "${cron}" não é de hora em hora`).toBe('*');
    });

    it('BDD 3: um job decide pela agenda, e o backup só roda se ele mandar', () => {
        const y = yml();
        expect(y, 'nenhum passo consulta a agenda').toMatch(/node db\/agenda-backup\.mjs/);
        expect(y, 'o job de backup não depende da decisão').toMatch(/needs:\s*agenda/);
        expect(y, 'o job de backup roda mesmo quando a agenda manda pular')
            .toMatch(/if:\s*needs\.agenda\.outputs\.executar\s*==\s*'true'/);
    });
});

describe('TASK-112 — só ADMIN lê e altera a agenda', () => {
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

    it('BDD 4: sem sessão 401; GESTOR 403 — ler e alterar', async () => {
        expect((await (await comSessao(null)).GET()).status).toBe(401);
        expect((await (await comSessao('GESTOR')).GET()).status).toBe(403);
        expect((await (await comSessao('GESTOR')).POST(post({ hora: 4, vezes: 1 }))).status).toBe(403);
    });

    it('BDD 4: ADMIN grava, e a leitura devolve a agenda com os horários', async () => {
        const { POST } = await comSessao('ADMIN');
        expect((await POST(post({ hora: 4, vezes: 2 }))).status).toBe(200);

        const { GET } = await comSessao('ADMIN');
        const corpo = await (await GET()).json();
        expect(corpo).toMatchObject({ hora: 4, vezes: 2, horarios: [4, 16] });
    });

    it('BDD 4: valor fora da faixa é recusado com 400 — e nada é gravado', async () => {
        const { POST } = await comSessao('ADMIN');
        await POST(post({ hora: 6, vezes: 1 }));
        for (const ruim of [{ hora: 24, vezes: 1 }, { hora: 3, vezes: 5 }, { hora: 3, vezes: 0 }, { hora: '3', vezes: 1 }, { hora: 2.5, vezes: 1 }]) {
            const res = await (await comSessao('ADMIN')).POST(post(ruim));
            expect(res.status, JSON.stringify(ruim)).toBe(400);
        }
        const corpo = await (await (await comSessao('ADMIN')).GET()).json();
        expect(corpo.hora, 'um valor recusado chegou ao banco').toBe(6);
    });

    it('BDD 4: a mudança entra na trilha de auditoria (§3, REQ-010)', async () => {
        const antes = await (await import('@/lib/pg')).queryOne<{ n: number }>(
            `SELECT count(*)::int AS n FROM action_logs WHERE action = 'BACKUP_AGENDA_ALTERADA'`);
        await (await comSessao('ADMIN')).POST(post({ hora: 2, vezes: 3 }));
        const depois = await (await import('@/lib/pg')).queryOne<{ n: number }>(
            `SELECT count(*)::int AS n FROM action_logs WHERE action = 'BACKUP_AGENDA_ALTERADA'`);
        expect(depois!.n, 'a agenda mudou e ninguém ficou sabendo quem mudou').toBe(antes!.n + 1);
    });
});

describe('TASK-112 — as linhas órfãs do ADR-013 saem', () => {
    it('BDD 6: uma migration apaga `backup_time` e `backup_retention_count` — e só elas', async () => {
        // Gravadas pela tela antiga e lidas por ninguém desde a TASK-082; vieram da carga
        // sintética da TASK-067. Ficar com elas é deixar uma mina: o dia em que alguém
        // "reaproveitar" a chave, um valor esquecido vira a agenda de produção.
        const { listarMigracoes } = await import('../db/runner-migracoes.mjs');
        const m = listarMigracoes(path.resolve(RAIZ, 'db/migrations-pg'))
            .find(x => /backup_time/.test(x.conteudo) && /DELETE\s+FROM\s+settings/i.test(x.conteudo));
        expect(m, 'nenhuma migration apaga as linhas órfãs').toBeTruthy();
        const deletes = m!.conteudo.replace(/--[^\n]*/g, '').match(/DELETE\s+FROM\s+settings[^;]*;/gi) ?? [];
        expect(deletes.join(' ')).toMatch(/backup_time/);
        expect(deletes.join(' ')).toMatch(/backup_retention_count/);
        expect(deletes.join(' '), 'apaga mais do que as órfãs').not.toMatch(/auto_logout_time|backup_hora|backup_vezes/);
    });
});

describe('TASK-112 — a tela oferece o que o sistema faz, e só isso', () => {
    const tela = () => semComentarios('src/app/settings/SettingsClient.tsx');

    it('BDD 5: hora e vezes por dia, lidas e gravadas pela rota da agenda', () => {
        expect(tela()).toMatch(/\/api\/backups\/agenda/);
        expect(tela(), 'a tela não oferece as vezes por dia').toMatch(/vezes/i);
    });

    it('BDD 5: diz que o horário é aproximado — o GitHub atrasa agendas', () => {
        expect(tela()).toMatch(/por volta d/i);
    });

    it('BDD 5: retenção ainda NÃO aparece — só é aplicada na TASK-113', () => {
        expect(tela(), 'campo de retenção antes de existir a poda: controle inerte (ADR-013)')
            .not.toMatch(/reten[çc][ãa]o/i);
    });
});
