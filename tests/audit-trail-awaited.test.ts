import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { query, execute } from '@/lib/pg';

// TASK-081 (Sprint 22 · Etapa 7a do ADR-012) — a trilha de auditoria é
// esperada, não largada. REQ-010 + REQ-031, critério de aceite (d).
//
// ## O defeito
//
// 26 chamadas de `logAction` sem `await`, em 12 arquivos. `logAction` grava em
// `action_logs` e chama `logStructured`, que a TASK-074 tornou assíncrono. Em
// execução serverless a instância pode congelar assim que a resposta sai, e a
// escrita pendente morre com ela.
//
// Isso torna a TASK-074 INCOMPLETA: o logger passou a esperar, mas seu principal
// chamador continua soltando a promessa.
//
// ## Por que os cenários daqui são estruturais, e não de comportamento
//
// Promise solta NÃO TEM SINTOMA CONFIÁVEL em teste. Em Node, o `await` da
// asserção seguinte cede o event loop e a escrita pendente completa — o teste
// passa com o defeito presente, e passaria também depois de corrigido. Ele não
// distingue as duas versões, então não mede nada.
//
// O que distingue é o TEXTO da chamada. Por isso a asserção principal aqui lê o
// fonte, como já foi preciso fazer para o pool preguiçoso (TASK-068), para a
// criação de pool no topo do módulo, e para o `config.matcher` do proxy
// (TASK-077) — a mesma família de defeito: correto no tipo, invisível no teste,
// visível só no texto ou em produção.
//
// O cenário de comportamento existe mesmo assim, mas com papel honesto e
// declarado: provar que acrescentar `await` NÃO QUEBROU a gravação. Ele não
// prova a ausência do defeito.

vi.mock('next/headers', () => ({
    cookies: () => ({ get: vi.fn().mockReturnValue({ value: 'token-de-teste' }), set: vi.fn() }),
    headers: () => Promise.resolve(new Headers()),
}));

vi.mock('@/lib/session', () => ({
    verifySession: vi.fn().mockResolvedValue({ id: 1, role: 'ADMIN', username: 'test_admin' }),
}));

const RAIZ = process.cwd();

/** Arquivos .ts/.tsx de src/, com comentários removidos. */
function fontesDeSrc(): { rel: string; fonte: string }[] {
    const saida: { rel: string; fonte: string }[] = [];
    const varrer = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) varrer(p);
            else if (/\.tsx?$/.test(e.name)) {
                saida.push({
                    rel: path.relative(RAIZ, p).split(path.sep).join('/'),
                    fonte: fs.readFileSync(p, 'utf-8')
                        .replace(/\/\*[\s\S]*?\*\//g, '')
                        .replace(/^\s*\/\/.*$/gm, ''),
                });
            }
        }
    };
    varrer(path.resolve(RAIZ, 'src'));
    return saida;
}

beforeEach(async () => {
    await execute('DELETE FROM action_logs');
});

describe('TASK-081 — nenhuma chamada da trilha fica sem espera', () => {
    it('BDD 1: nenhum `logAction(` em src/ sem `await`', () => {
        const alvos: string[] = [];

        for (const { rel, fonte } of fontesDeSrc()) {
            if (rel === 'src/lib/logger.ts') continue; // é a definição

            fonte.split('\n').forEach((linha, i) => {
                if (!/\blogAction\s*\(/.test(linha)) return;
                if (/\bimport\b|\bexport\b/.test(linha)) return;
                // `await logAction(`, `return logAction(` e `.push(logAction(` são
                // formas em que a promessa NÃO se perde.
                if (/\b(await|return)\s+logAction\s*\(/.test(linha)) return;
                if (/\.(then|catch|finally)\s*\(|Promise\.(all|allSettled)/.test(linha)) return;
                alvos.push(`${rel}:${i + 1}`);
            });
        }

        expect(
            alvos,
            `trilha de auditoria largada — a escrita pode morrer com a instância:\n${alvos.join('\n')}`,
        ).toEqual([]);
    });

    it('BDD 1: o mesmo vale para as demais funções assíncronas de trilha', () => {
        const assincronas = ['logStructured', 'logTiming', 'recordLoginAttempt', 'clearLoginAttempts'];
        const alvos: string[] = [];

        for (const { rel, fonte } of fontesDeSrc()) {
            if (rel === 'src/lib/structured-logger.ts' || rel === 'src/lib/security-profile.ts') continue;

            fonte.split('\n').forEach((linha, i) => {
                for (const nome of assincronas) {
                    if (!new RegExp(`\\b${nome}\\s*\\(`).test(linha)) continue;
                    if (/\bimport\b|\bexport\b/.test(linha)) continue;
                    if (new RegExp(`\\b(await|return)\\s+${nome}\\s*\\(`).test(linha)) continue;
                    if (/\.(then|catch|finally)\s*\(/.test(linha)) continue;
                    alvos.push(`${rel}:${i + 1} — ${nome}`);
                }
            });
        }

        expect(alvos, `promessa de trilha solta:\n${alvos.join('\n')}`).toEqual([]);
    });

    it('BDD 2: a guarda é mecânica, não vigilância humana', () => {
        // Promise solta é invisível numa revisão: não há sintoma, o teste passa,
        // o tipo está certo e a linha parece igual a uma chamada síncrona. Depender
        // de alguém reparar é depender de alguém reparar 26 vezes seguidas.
        const config = fs.readFileSync(path.resolve(RAIZ, 'eslint.config.mjs'), 'utf-8');
        expect(
            config,
            'sem regra de lint, a próxima promise solta entra sem nada avisar',
        ).toMatch(/no-floating-promises/);
    });
});

describe('TASK-081 — a espera não quebrou a gravação', () => {
    // Papel honesto deste bloco: NÃO prova ausência de promise solta (ver o
    // comentário do topo). Prova que a trilha continua sendo escrita depois de
    // acrescentar `await` — que é o risco real de uma mudança em 12 arquivos.

    it('BDD 3: a rota destrutiva grava a trilha antes de responder', async () => {
        const { DELETE } = await import('@/app/api/history/clear/route');
        const res = await DELETE();
        expect(res.status).toBe(200);

        const trilha = await query<{ action: string }>(
            "SELECT action FROM action_logs WHERE action = 'CLEAR_HISTORY'",
        );
        expect(trilha.length, 'a trilha não estava gravada quando a resposta saiu').toBeGreaterThan(0);
    });

    it('BDD 3: uma rota de escrita comum também grava', async () => {
        const { POST } = await import('@/app/api/keys/route');
        const res = await POST(new Request('http://localhost/api/keys', {
            method: 'POST',
            body: JSON.stringify({ name: 'Chave 081', room: 'Sala 081' }),
        }) as never);
        expect([200, 201]).toContain(res.status);

        const trilha = await query<{ action: string; target: string }>(
            "SELECT action, target FROM action_logs WHERE action = 'CREATE_KEY'",
        );
        expect(trilha.length, 'CREATE_KEY não chegou em action_logs').toBeGreaterThan(0);
        expect(trilha[0].target).toBe('Chave 081');
    });
});
