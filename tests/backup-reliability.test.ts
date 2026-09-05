import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execute, withTransaction } from '@/lib/pg';
import { getBackupReliability } from '@/lib/backup';
import { descreverConfiabilidade } from '@/lib/backup-reliability';
import { APP_TIMEZONE } from '@/lib/time-filters';

// TASK-075 (Sprint 23 · Etapa 7b do ADR-012) — a métrica de confiabilidade
// passa a ler o banco. REQ-009, spec §5.
//
// ## O que estava errado
//
// `getBackupReliability()` lia `backups/backup-history.jsonl`. Esse arquivo
// deixou de ser escrito quando a TASK-070 neutralizou o `backup.ts` na Sprint
// 21, e no Vercel não existiria de qualquer forma — o disco é efêmero. A métrica
// devolvia "sem dados" havia duas sprints, e a tela escondia o bloco inteiro
// quando não havia dado.
//
// ## Por que esconder é a pior das opções
//
// Ausência de bloco na tela é indistinguível de "está tudo bem, não há o que
// mostrar". A única leitura que importa nessa métrica é a ruim: se o backup não
// está rodando, a tela tem de dizer isso em voz alta. Por isso os cenários abaixo
// insistem que "nunca rodou", "parou de rodar" e "rodou e falhou" produzam três
// respostas DIFERENTES — nenhuma delas 100%, nenhuma delas silêncio.
//
// ## Três estados, não dois
//
// O critério da micro-spec pede para separar "nunca rodou" de "rodou e falhou".
// Escrever os cenários revelou um terceiro, que é o mais traiçoeiro: rodou por
// meses e PAROU. Com a janela de 30 dias, ele produz exatamente a mesma leitura
// de quem nunca rodou — `percent: null` — e as duas situações não se parecem em
// nada. Daí `lastRun` ser lido FORA da janela: é o que permite a tela dizer
// "sem execução nos últimos 30 dias; a última foi em <data>".

const RAIZ = process.cwd();

async function limpar() {
    await withTransaction(async (tx) => {
        // `backup_runs` é imutável por trigger (TASK-078). O bypass transacional
        // existe justamente para manutenção — aqui, isolar um cenário do outro.
        await tx.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
        await tx.execute('DELETE FROM backup_runs');
    });
}

/**
 * Semeia uma execução no MEIO-DIA local de N dias atrás.
 *
 * O meio-dia não é decoração: semear em "agora menos N dias" faz o cenário
 * depender da hora em que a suíte roda. Rodando 00:30, "duas horas antes" cai no
 * dia anterior e o teste de agrupamento por dia passa a contar dois dias — falha
 * que não tem nada a ver com o código sob teste, e que só apareceria de
 * madrugada.
 */
async function semear(
    diasAtras: number,
    succeeded: boolean,
    opcoes: { hora?: number; sizeBytes?: number | null; error?: string | null; destination?: string | null } = {},
) {
    const { hora = 12, sizeBytes = null, error = null, destination = null } = opcoes;
    await execute(
        `INSERT INTO backup_runs (ran_at, succeeded, size_bytes, error, destination)
         VALUES (
             ((date_trunc('day', now() AT TIME ZONE $1) - make_interval(days => $2) + make_interval(hours => $3)) AT TIME ZONE $1),
             $4, $5, $6, $7
         )`,
        [APP_TIMEZONE, diasAtras, hora, succeeded, sizeBytes, error, destination],
    );
}

beforeEach(limpar);

describe('TASK-075 — a confiabilidade vem de backup_runs', () => {
    it('BDD 1: o percentual é dias com sucesso sobre dias com execução', async () => {
        await semear(2, true);
        await semear(1, false);
        await semear(0, true);

        const m = await getBackupReliability(30);
        expect(m.totalDays, 'três dias tiveram execução').toBe(3);
        expect(m.successDays).toBe(2);
        expect(m.percent).toBeCloseTo(66.7, 1);
    });

    it('BDD 1: duas execuções no mesmo dia contam UM dia, e a repetição bem-sucedida salva o dia', async () => {
        // O caso real: o job falha às 03h, alguém dispara de novo às 09h e
        // funciona. O dia teve backup. Contar execuções em vez de dias mostraria
        // 50% num dia que terminou protegido.
        await semear(1, false, { hora: 3 });
        await semear(1, true, { hora: 9 });

        const m = await getBackupReliability(30);
        expect(m.totalDays, 'as duas execuções são do mesmo dia').toBe(1);
        expect(m.successDays).toBe(1);
        expect(m.percent).toBe(100);
    });

    it('BDD 1: execução fora da janela não entra no cálculo', async () => {
        await semear(40, true);
        await semear(1, false);

        const m = await getBackupReliability(30);
        expect(m.totalDays, 'a de 40 dias atrás está fora da janela de 30').toBe(1);
        expect(m.successDays).toBe(0);
        expect(m.percent).toBe(0);
    });

    it('BDD 1: a última execução vem com o que se precisa para agir', async () => {
        await semear(1, true, { sizeBytes: 4096, destination: 'repo-privado:backups/2026/09/2026-09-03.sql.gz' });
        await semear(0, false, { error: 'pg_dump: connection refused' });

        const m = await getBackupReliability(30);
        expect(m.lastRun, 'a última execução tem de vir').not.toBeNull();
        expect(m.lastRun!.succeeded, 'a última foi a que falhou').toBe(false);
        expect(m.lastRun!.error).toMatch(/connection refused/);
        // O driver entrega timestamptz como Date. A tela formata com
        // `formatTimestamp`, que já custou uma quebra na Sprint 21 ao receber
        // Date onde esperava string — a rota serializa, então o contrato aqui é
        // string ISO.
        expect(typeof m.lastRun!.ranAt, 'ranAt tem de atravessar o JSON como string').toBe('string');
    });

    it('BDD 3: a métrica não lê arquivo nenhum', async () => {
        const fonte = fs.readFileSync(path.resolve(RAIZ, 'src/lib/backup.ts'), 'utf-8');
        expect(fonte, 'ainda lê o .jsonl').not.toMatch(/backup-history\.jsonl/);
        expect(fonte, 'ainda toca o filesystem').not.toMatch(/from ['"](node:)?fs['"]|fs\.[a-zA-Z]+\s*\(/);
    });

    it('BDD 3: nada em src/ menciona o .jsonl', () => {
        const achados: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name) && fs.readFileSync(p, 'utf-8').includes('backup-history.jsonl')) {
                    achados.push(path.relative(RAIZ, p));
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(achados, `ainda citam o arquivo morto:\n${achados.join('\n')}`).toEqual([]);
    });
});

describe('TASK-075 — "nunca rodou" e "rodou e falhou" são estados diferentes', () => {
    it('BDD 2: sem registro nenhum, a métrica diz que não há execução — não 0%, não 100%', async () => {
        const m = await getBackupReliability(30);
        expect(m.totalDays).toBe(0);
        expect(m.percent, 'zero por cento seria mentira: nada foi tentado').toBeNull();
        expect(m.lastRun, 'não há última execução').toBeNull();

        const d = descreverConfiabilidade(m);
        expect(d.estado).toBe('sem-execucao');
        expect(d.titulo, 'a tela não pode ficar em branco nem mostrar número').toMatch(/nenhuma execução/i);
    });

    it('BDD 2: rodou e falhou é 0% — e não se parece com nunca ter rodado', async () => {
        await semear(0, false, { error: 'pg_dump: could not connect' });

        const comFalha = await getBackupReliability(30);
        expect(comFalha.percent, 'houve execução, e ela falhou').toBe(0);
        expect(comFalha.totalDays).toBe(1);

        await limpar();
        const semNada = await getBackupReliability(30);

        expect(comFalha.percent).not.toBe(semNada.percent);
        expect(descreverConfiabilidade(comFalha).estado).toBe('falhando');
        expect(descreverConfiabilidade(semNada).estado).toBe('sem-execucao');
    });

    it('BDD 2: rodou e PAROU não é o mesmo que nunca ter rodado', async () => {
        // O estado que a micro-spec não previu, e o mais perigoso dos três: com
        // a janela de 30 dias os dois dão `percent: null`. A diferença é que
        // aqui existe uma última execução, e a tela precisa dizer quando foi.
        await semear(45, true);

        const m = await getBackupReliability(30);
        expect(m.totalDays, 'nada dentro da janela').toBe(0);
        expect(m.percent).toBeNull();
        expect(m.lastRun, 'mas houve execução antes da janela').not.toBeNull();

        const d = descreverConfiabilidade(m);
        expect(d.estado).toBe('parada');
        expect(d.detalhe, 'a tela tem de dizer quando foi a última').toMatch(/última/i);
    });

    it('BDD 2: cada estado tem um tom próprio, e só o íntegro é bom', async () => {
        const estados = [
            { m: { totalDays: 0, successDays: 0, percent: null, lastRun: null }, estado: 'sem-execucao', tom: 'alerta' },
            { m: { totalDays: 1, successDays: 0, percent: 0, lastRun: null }, estado: 'falhando', tom: 'ruim' },
            { m: { totalDays: 3, successDays: 2, percent: 66.7, lastRun: null }, estado: 'parcial', tom: 'ruim' },
            { m: { totalDays: 3, successDays: 3, percent: 100, lastRun: null }, estado: 'integra', tom: 'bom' },
        ];
        for (const caso of estados) {
            const d = descreverConfiabilidade(caso.m);
            expect(d.estado, JSON.stringify(caso.m)).toBe(caso.estado);
            expect(d.tom, JSON.stringify(caso.m)).toBe(caso.tom);
        }
    });

    it('BDD 2: a tela usa a descrição, e não um "> 0" que esconde o bloco', () => {
        const fonte = fs.readFileSync(path.resolve(RAIZ, 'src/app/settings/SettingsClient.tsx'), 'utf-8');
        expect(fonte, 'a tela precisa da descrição dos estados').toMatch(/descreverConfiabilidade/);
        expect(
            fonte,
            'o bloco voltou a ser condicionado a ter dado — é assim que "nunca rodou" some da tela',
        ).not.toMatch(/bkpReliability\.totalDays\s*>\s*0/);
    });
});

describe('TASK-075 — a rota de confiabilidade continua restrita', () => {
    it('BDD 4: sem sessão, 401', async () => {
        vi.resetModules();
        vi.doMock('next/headers', () => ({
            cookies: () => Promise.resolve({ get: () => undefined }),
        }));
        const { GET } = await import('@/app/api/backups/reliability/route');
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('BDD 4: sessão que não é ADMIN, 403 — trocar a fonte não afrouxa a autorização', async () => {
        vi.resetModules();
        vi.doMock('next/headers', () => ({
            cookies: () => Promise.resolve({ get: () => ({ value: 'token-de-porteiro' }) }),
        }));
        vi.doMock('@/lib/session', () => ({
            verifySession: () => Promise.resolve({ userId: 3, username: 'test_porteiro', role: 'PORTEIRO' }),
        }));
        const { GET } = await import('@/app/api/backups/reliability/route');
        const res = await GET();
        expect(res.status).toBe(403);
    });
});
