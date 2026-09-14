import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-132 (ADR-031 · REQ-033a) — uma escala de tipo que o código obedece.
//
// Medido na abertura do CR: 20 tamanhos de fonte em uso (CSS + estilo inline),
// contra os 5 que o DESIGN.md documentava, e o peso 800 em 29 lugares. Com quase
// todo texto entre 10 e 14 px e em negrito, nada liderava — a queixa "não parece
// ter hierarquia". O DESIGN.md sozinho nunca impediu nada: o detector acusava 103
// tamanhos fora da escala. Esta guarda é o que impede.

const RAIZ = process.cwd();
const SRC = path.join(RAIZ, 'src');

/** Os cinco degraus, em px, na ordem dos tokens --fs-1 … --fs-5. */
const ESCALA_PX = [12, 14, 16, 20, 28];
const PESOS = ['400', '600', '700'];

function arquivos(dir: string, ext: RegExp): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? arquivos(p, ext) : ext.test(e.name) ? [p] : [];
    });
}

const rel = (p: string) => path.relative(RAIZ, p).replace(/\\/g, '/');

/** Tira comentários de CSS para que um exemplo em comentário não conte. */
const semComentarioCss = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function lerTokensDeTamanho(): Record<string, number> {
    const css = fs.readFileSync(path.join(SRC, 'app/globals.css'), 'utf-8');
    const tokens: Record<string, number> = {};
    for (const m of css.matchAll(/--fs-(\d):\s*([\d.]+)rem\s*;/g)) tokens[m[1]] = Number(m[2]) * 16;
    return tokens;
}

describe('TASK-132 — a escala tem cinco degraus, declarados como tokens', () => {
    it('--fs-1 a --fs-5 existem no :root com 12, 14, 16, 20 e 28 px', () => {
        const tokens = lerTokensDeTamanho();
        expect(Object.keys(tokens).sort(), 'faltam tokens --fs-N no globals.css').toEqual(['1', '2', '3', '4', '5']);
        expect(['1', '2', '3', '4', '5'].map(n => tokens[n])).toEqual(ESCALA_PX);
    });

    it('--fw-regular, --fw-semibold e --fw-bold existem com 400, 600 e 700', () => {
        const css = fs.readFileSync(path.join(SRC, 'app/globals.css'), 'utf-8');
        expect(css).toMatch(/--fw-regular:\s*400\s*;/);
        expect(css).toMatch(/--fw-semibold:\s*600\s*;/);
        expect(css).toMatch(/--fw-bold:\s*700\s*;/);
    });

    it('o DESIGN.md documenta a mesma escala que o código usa', () => {
        // O hook de design do impeccable lê a escala do DESIGN.md; se os dois
        // divergem, o detector passa a acusar o que é certo e aceitar o que é errado.
        const design = fs.readFileSync(path.join(RAIZ, 'DESIGN.md'), 'utf-8');
        const frente = design.split(/^---\s*$/m)[1] ?? '';
        const tamanhos = [...frente.matchAll(/fontSize:\s*"([\d.]+)rem"/g)].map(m => Number(m[1]) * 16);
        expect([...new Set(tamanhos)].sort((a, b) => a - b), 'escala do DESIGN.md difere dos tokens').toEqual(ESCALA_PX);
    });
});

describe('TASK-132 — nenhum tamanho ou peso fora da escala', () => {
    it('todo font-size nos CSS é um token --fs-N (ou inherit)', () => {
        const fora: string[] = [];
        for (const f of arquivos(SRC, /\.css$/)) {
            const linhas = semComentarioCss(fs.readFileSync(f, 'utf-8')).split('\n');
            linhas.forEach((linha, i) => {
                const m = linha.match(/(?<![-\w])font-size:\s*([^;}]+)/);
                if (m && !/^\s*(var\(--fs-[1-5]\)|inherit)\s*$/.test(m[1])) fora.push(`${rel(f)}:${i + 1} ${m[1].trim()}`);
            });
        }
        expect(fora, `tamanhos fora da escala:\n${fora.join('\n')}`).toEqual([]);
    });

    it('todo fontSize inline nos componentes é um token --fs-N', () => {
        const fora: string[] = [];
        for (const f of arquivos(SRC, /\.tsx$/)) {
            const fonte = fs.readFileSync(f, 'utf-8');
            for (const m of fonte.matchAll(/fontSize:\s*([^,}\n]+)/g)) {
                if (!/^'var\(--fs-[1-5]\)'$/.test(m[1].trim())) fora.push(`${rel(f)} fontSize: ${m[1].trim()}`);
            }
            for (const m of fonte.matchAll(/fontSize=\{?["'\d]/g)) fora.push(`${rel(f)} atributo ${m[0]}`);
        }
        expect(fora, `tamanhos inline fora da escala:\n${fora.join('\n')}`).toEqual([]);
    });

    it('todo peso de fonte é 400, 600 ou 700 (ou o token)', () => {
        const fora: string[] = [];
        for (const f of arquivos(SRC, /\.css$/)) {
            semComentarioCss(fs.readFileSync(f, 'utf-8')).split('\n').forEach((linha, i) => {
                const m = linha.match(/(?<![-\w])font-weight:\s*([^;}]+)/);
                if (m && !/^\s*(var\(--fw-(regular|semibold|bold)\)|inherit|400|600|700)\s*$/.test(m[1])) {
                    fora.push(`${rel(f)}:${i + 1} ${m[1].trim()}`);
                }
            });
        }
        for (const f of arquivos(SRC, /\.tsx$/)) {
            for (const m of fs.readFileSync(f, 'utf-8').matchAll(/fontWeight:\s*([^,}\n]+)/g)) {
                const v = m[1].trim().replace(/^'|'$/g, '');
                if (!PESOS.includes(v) && !/^var\(--fw-(regular|semibold|bold)\)$/.test(v)) fora.push(`${rel(f)} fontWeight: ${v}`);
            }
        }
        expect(fora, `pesos fora da escala:\n${fora.join('\n')}`).toEqual([]);
    });
});

describe('TASK-132 — a fonte é a Atkinson Hyperlegible', () => {
    it('o layout raiz carrega a Atkinson Hyperlegible Next pelo next/font, e não a Inter', () => {
        // Escolha do usuário (ADR-031): desenhada para baixa visão — I/l/1, O/0 e a/o
        // não se confundem. O público que guia as telas são funcionários de apoio e
        // porteiros, parte com pouca instrução e fonte do celular aumentada.
        const layout = fs.readFileSync(path.join(SRC, 'app/layout.tsx'), 'utf-8');
        expect(layout).toMatch(/Atkinson_Hyperlegible_Next/);
        expect(layout).not.toMatch(/\bInter\b/);
    });

    it('nenhum CSS ou componente ainda aponta para a variável da Inter', () => {
        const restos = [...arquivos(SRC, /\.(css|tsx|ts)$/)]
            .filter(f => fs.readFileSync(f, 'utf-8').includes('--font-inter'))
            .map(rel);
        expect(restos, 'variável --font-inter ainda referenciada').toEqual([]);
    });
});
