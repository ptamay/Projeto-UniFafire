import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { query, execute, withTransaction } from '@/lib/pg';
import { buildHistoryQuery } from '@/lib/history-query';

// TASK-069 fatia (e) (Sprint 21 · Etapa 4 do ADR-012) — Server Components e a
// montagem da consulta do histórico. Fecha a conversão.
//
// `history-query.ts` ficou pendente desde a fatia (a) por não ser autocontido:
// ele MONTA o SQL e quem executa é `history/page.tsx`. Trocar `?` por `$n` lá
// quebraria o consumidor. Agora os dois andam juntos.
//
// O risco desta fatia é a numeração dinâmica. `buildHistoryQuery` empilha
// condições conforme os filtros chegam, e `$n` precisa acompanhar a ordem do
// array de valores. Um erro aí não é erro de sintaxe: com os filtros na ordem
// "certa" o SQL roda e devolve o resultado ERRADO — filtrando por chave onde
// deveria filtrar por portador, por exemplo. Por isso os testes abaixo não
// inspecionam a string: eles EXECUTAM cada combinação contra o Postgres e
// conferem quais linhas voltam.
//
// Segunda conversão, que o oráculo não listou: `COLLATE NOCASE` é exclusivo do
// SQLite. No Postgres a ordenação sem diferenciar maiúsculas se faz com
// `lower()` — deixar o COLLATE quebraria a página com erro de sintaxe.

const K1 = 930, K2 = 931;
const U1 = 932, U2 = 933;

beforeEach(async () => {
    await withTransaction(async (t) => {
        await t.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
        await t.execute('DELETE FROM history WHERE key_id IN ($1, $2)', [K1, K2]);
    });
    await execute('DELETE FROM keys WHERE id IN ($1, $2)', [K1, K2]);
    await execute('DELETE FROM users WHERE id IN ($1, $2)', [U1, U2]);

    await execute(
        `INSERT INTO users (id, username, full_name, role, active) OVERRIDING SYSTEM VALUE
         VALUES ($1, 'zelia_rsc', 'zelia da Silva', 'ALUNO', true),
                ($2, 'artur_rsc', 'Artur Pereira', 'ALUNO', true)`, [U1, U2]);
    await execute(
        `INSERT INTO keys (id, name, room, status, active) OVERRIDING SYSTEM VALUE
         VALUES ($1, 'zebra RSC', 'S1', 'available', true),
                ($2, 'Alfa RSC', 'S2', 'available', true)`, [K1, K2]);

    // Quatro linhas cruzando portador × chave × ação: qualquer troca de $n entre
    // os filtros muda o conjunto que volta.
    await execute(
        `INSERT INTO history (key_id, user_id, username, action, timestamp) VALUES
         ($1, $3, 'zelia_rsc', 'withdraw', '2026-03-10T18:30:00.000Z'),
         ($1, $4, 'artur_rsc', 'return',   '2026-03-10T18:30:00.000Z'),
         ($2, $3, 'zelia_rsc', 'return',   '2026-03-10T18:30:00.000Z'),
         ($2, $4, 'artur_rsc', 'withdraw', '2026-03-10T18:30:00.000Z')`,
        [K1, K2, U1, U2]);
});

async function rodar(filtros: Parameters<typeof buildHistoryQuery>[0]) {
    const q = buildHistoryQuery(filtros);
    return query<{ id: number; action: string; key_name: string; employee_name: string }>(
        q.sql, q.params as never[],
    );
}

describe('TASK-069(e) — a consulta do histórico executa no Postgres', () => {
    it('sem filtro, traz as quatro linhas', async () => {
        const linhas = await rodar({});
        const nossas = linhas.filter(l => /RSC/.test(l.key_name));
        expect(nossas.length, 'a consulta montada não roda no Postgres').toBe(4);
    });

    it('filtrar por portador traz só as dele', async () => {
        const linhas = await rodar({ userId: String(U1) });
        const nossas = linhas.filter(l => /RSC/.test(l.key_name));
        expect(nossas.length).toBe(2);
        expect(nossas.every(l => l.employee_name === 'zelia da Silva')).toBe(true);
    });

    it('filtrar por chave traz só as dela', async () => {
        const linhas = await rodar({ keyId: String(K2) });
        const nossas = linhas.filter(l => /RSC/.test(l.key_name));
        expect(nossas.length).toBe(2);
        expect(nossas.every(l => l.key_name === 'Alfa RSC')).toBe(true);
    });

    it('portador E chave E ação juntos — a numeração de $n tem de acompanhar', async () => {
        // O caso que pega troca de posição: três filtros, e só UMA linha cruza os três.
        const linhas = await rodar({ userId: String(U1), keyId: String(K1), action: 'withdraw' });
        const nossas = linhas.filter(l => /RSC/.test(l.key_name));

        expect(nossas.length, 'os três filtros juntos não cruzaram como deviam').toBe(1);
        expect(nossas[0].key_name).toBe('zebra RSC');
        expect(nossas[0].employee_name).toBe('zelia da Silva');
        expect(nossas[0].action).toBe('withdraw');
    });

    it('filtro de data combinado com portador mantém a numeração correta', async () => {
        const linhas = await rodar({ date: '2026-03-10', userId: String(U2) });
        const nossas = linhas.filter(l => /RSC/.test(l.key_name));
        expect(nossas.length).toBe(2);
        expect(nossas.every(l => l.employee_name === 'Artur Pereira')).toBe(true);
    });

    it('filtro de hora usa o fuso do operador, não a hora UTC crua', async () => {
        // 18:30Z = 15:30 em America/Recife. O operador digita 15.
        const casa = await rodar({ hour: '15' });
        expect(
            casa.filter(l => /RSC/.test(l.key_name)).length,
            'a conversão de fuso da TASK-055 se perdeu na migração',
        ).toBe(4);

        const naoCasa = await rodar({ hour: '18' });
        expect(
            naoCasa.filter(l => /RSC/.test(l.key_name)).length,
            'casou com a hora UTC crua',
        ).toBe(0);
    });

    it('a contagem paginada roda e bate com o filtro', async () => {
        const q = buildHistoryQuery({ userId: String(U1) });
        const total = await query<{ total: string }>(q.countSql, q.countParams as never[]);
        expect(Number(total[0].total)).toBeGreaterThanOrEqual(2);
    });
});

describe('TASK-069(e) — ordenação sem diferenciar maiúsculas', () => {
    it('COLLATE NOCASE não sobrevive: é exclusivo do SQLite', () => {
        const alvos: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name) && /COLLATE\s+NOCASE/i.test(fs.readFileSync(p, 'utf-8'))) {
                    alvos.push(p);
                }
            }
        };
        varrer(path.resolve(process.cwd(), 'src'));
        expect(alvos, `COLLATE NOCASE é erro de sintaxe no Postgres:\n${alvos.join('\n')}`).toEqual([]);
    });

    it('a lista de portadores do filtro ordena ignorando maiúsculas', async () => {
        // 'Artur' antes de 'zelia': com ordenação sensível a caso, o Z maiúsculo
        // viria antes do a minúsculo e a lista sairia fora de ordem para o operador.
        const linhas = await query<{ name: string }>(`
            SELECT DISTINCT u.id, COALESCE(u.full_name, u.username) as name
            FROM history h JOIN users u ON h.user_id = u.id
            WHERE u.id IN ($1, $2)
            ORDER BY lower(COALESCE(u.full_name, u.username))
        `, [U1, U2]);
        expect(linhas.map(l => l.name)).toEqual(['Artur Pereira', 'zelia da Silva']);
    });
});

describe('TASK-069(e) — os Server Components saem do SQLite', () => {
    it('nenhum dos quatro importa mais @/lib/db', () => {
        for (const rel of ['page.tsx', 'history/page.tsx', 'keys/page.tsx', 'account/profile/page.tsx']) {
            const fonte = fs.readFileSync(path.resolve(process.cwd(), 'src/app', rel), 'utf-8')
                .replace(/\/\/.*$/gm, '');
            expect(fonte, `${rel} ainda usa o SQLite`).not.toMatch(/@\/lib\/db['"]/);
        }
    });

    it('continuam sendo Server Components — nenhum virou client', () => {
        // A saída fácil para "consulta virou assíncrona" é empurrar a página para
        // o cliente. Isso perderia o SSR e mandaria a consulta para o navegador.
        for (const rel of ['page.tsx', 'history/page.tsx', 'keys/page.tsx', 'account/profile/page.tsx']) {
            const fonte = fs.readFileSync(path.resolve(process.cwd(), 'src/app', rel), 'utf-8');
            expect(fonte, `${rel} virou client component`).not.toMatch(/^\s*['"]use client['"]/m);
        }
    });
});
