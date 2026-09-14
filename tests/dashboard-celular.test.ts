import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-134 (ADR-031 · REQ-033b/c) — o Dashboard no celular vira o quadro de chaves.
//
// Antes: título de duas linhas, subtítulo, dois contadores e a caixa da dupla confirmação
// empurravam a busca para ~40% da tela; cada chave era um cartão, e a chave livre não
// mostrava ação — tocar no cartão inteiro era "retirar", e nada dizia isso. O mesmo verbo
// "Solicitar" servia para pegar uma chave livre e para pedir uma chave que está com outra
// pessoa. A E2E (tests/e2e/dashboard-celular.spec.ts) mede a tela; esta guarda confere a
// fonte, onde o problema nasce.

const RAIZ = process.cwd();
const DASHBOARD = fs.readFileSync(path.join(RAIZ, 'src/app/components/DashboardClient.tsx'), 'utf-8');
const CSS = fs.readFileSync(path.join(RAIZ, 'src/app/globals.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Corpo das regras de um seletor dentro do bloco do celular (@media max-width: 768px). */
function noCelular(seletor: RegExp): string {
    const corpos: string[] = [];
    for (const m of CSS.matchAll(/@media\s*\(max-width:\s*768px\)\s*\{/g)) {
        let nivel = 1, j = m.index! + m[0].length;
        const inicio = j;
        while (j < CSS.length && nivel > 0) { if (CSS[j] === '{') nivel++; else if (CSS[j] === '}') nivel--; j++; }
        const bloco = CSS.slice(inicio, j - 1);
        for (const r of bloco.matchAll(/([^{}]+)\{([^}]*)\}/g)) if (seletor.test(r[1])) corpos.push(r[2]);
    }
    return corpos.join(';');
}

/** Rótulos visíveis de botão no Dashboard: texto direto entre as tags e strings de ternário dentro de <button>. */
const rotulos = () => [...DASHBOARD.matchAll(/<button[\s\S]*?>([\s\S]*?)<\/button>/g)].map(m => m[1]);

describe('TASK-134 — cada chave diz a ação em palavra', () => {
    it('os verbos do quadro existem: Pegar, Entregar, Devolver, Pedir e "Passar para outra pessoa"', () => {
        for (const verbo of ['Pegar', 'Entregar', 'Devolver', 'Pedir', 'Passar para outra pessoa']) {
            expect(DASHBOARD, `falta o verbo "${verbo}"`).toContain(verbo);
        }
    });

    it('"Solicitar" e "Transferir" saíram dos botões — um nome para duas ações diferentes', () => {
        const ambiguos = rotulos().filter(r => /\b(Solicitar|Transferir)\b/.test(r)).map(r => r.trim().slice(0, 60));
        expect(ambiguos, `botões com o verbo antigo:\n${ambiguos.join('\n')}`).toEqual([]);
    });

    it('a linha da chave (.plaqueta) não é um botão escondido: sem onClick, role="button" ou tabIndex', () => {
        const aberturas = [...DASHBOARD.matchAll(/<(li|div)\b[^>]*className=\{?[`"'][^`"']*\bplaqueta\b(?![-\w])[^>]*>/g)].map(m => m[0]);
        expect(aberturas.length, 'não há .plaqueta no Dashboard').toBeGreaterThan(0);
        for (const a of aberturas) {
            expect(a, 'a plaqueta age ao toque').not.toMatch(/onClick|role=|tabIndex/);
        }
    });

    it('o estado livre se chama "Livre" (a palavra do quadro), não "Disponível"', () => {
        expect(DASHBOARD).not.toMatch(/'Disponível'/);
        expect(DASHBOARD).toMatch(/'Livre'/);
    });
});

describe('TASK-134 — no celular, a busca e a lista vêm primeiro', () => {
    it('a busca e os filtros ficam presos logo abaixo da barra do topo ao rolar', () => {
        const corpo = noCelular(/\.dashboard-controles\b/);
        expect(corpo, 'falta .dashboard-controles no bloco do celular').toMatch(/position\s*:\s*sticky/);
        expect(corpo).toMatch(/top\s*:\s*calc\(\s*var\(--navbar-h\)/);
    });

    it('os contadores soltos saem do celular: os filtros é que dizem quantas chaves há', () => {
        expect(noCelular(/\.dashboard-stats\b/)).toMatch(/display\s*:\s*none/);
        // A contagem vai dentro de cada filtro.
        expect(DASHBOARD).toMatch(/className="filtro-conta"/);
    });

    it('no celular, alerta, pendências e a explicação vêm DEPOIS da busca (ordem da coluna)', () => {
        expect(noCelular(/\.dashboard-corpo\b/)).toMatch(/display\s*:\s*flex/);
        const ordem = (cls: string) => Number(noCelular(new RegExp(`\\.${cls}\\b`)).match(/order\s*:\s*(\d+)/)?.[1] ?? NaN);
        expect(ordem('dashboard-controles')).toBeLessThan(ordem('dashboard-alerta'));
        expect(ordem('dashboard-alerta')).toBeLessThan(ordem('dashboard-lista'));
        expect(ordem('dashboard-lista')).toBeLessThan(ordem('dashboard-explicacao'));
    });
});
