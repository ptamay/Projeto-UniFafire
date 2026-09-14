import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-127 — toda chamada das telas à API usa um método que a rota ATENDE.
//
// ## O defeito, relatado pelo usuário com captura (2026-09-14)
//
// "Erro ao limpar histórico." ao confirmar a limpeza. A tela chamava
// `POST /api/history/clear`, e desde 2026-05-21 (`fd7d603`) a rota exporta só `DELETE` —
// que é o que o contrato de API documenta. O Next responde 405 e a tela mostra o toast de
// erro. Quatro meses quebrado, e três testes cobriam a rota: todos importam o handler
// `DELETE` e o chamam direto. Nenhum olhava a costura entre a tela e a rota.
//
// ## O que esta guarda cobra
//
// A costura, para todas as chamadas de uma vez: cada `fetch('/api/…')` em `src/` (fora das
// próprias rotas) resolve para um `route.ts` que exporta o método usado — `GET` quando a
// chamada não diz `method`. Segmento `${…}` casa com pasta dinâmica (`[id]`) ou, se for o
// próprio nome do endpoint variando (`${endpoint}`), com qualquer pasta daquele nível.

const RAIZ = process.cwd();
const SRC = path.join(RAIZ, 'src');
const API = path.join(SRC, 'app', 'api');
const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function arquivos(dir: string): string[] {
    const saida: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (p !== API) saida.push(...arquivos(p)); }
        else if (/\.(tsx?|mjs)$/.test(e.name)) saida.push(p);
    }
    return saida;
}

/** O trecho entre o `(` de `fetch(` e o `)` que o fecha. */
function argumentos(fonte: string, inicio: number): string {
    let prof = 0;
    for (let i = inicio; i < fonte.length; i++) {
        if (fonte[i] === '(') prof++;
        else if (fonte[i] === ')' && --prof === 0) return fonte.slice(inicio + 1, i);
    }
    return fonte.slice(inicio + 1);
}

interface Chamada { arquivo: string; linha: number; url: string; metodos: string[] }

function chamadas(): Chamada[] {
    const saida: Chamada[] = [];
    for (const arquivo of arquivos(SRC)) {
        const fonte = fs.readFileSync(arquivo, 'utf-8');
        for (const m of fonte.matchAll(/\bfetch\(\s*(['"`])(\/api\/[^'"`]*)\1/g)) {
            const args = argumentos(fonte, m.index! + m[0].indexOf('('));
            const expr = args.match(/\bmethod\s*:\s*([^,}\n]+)/)?.[1] ?? '';
            const ditos = [...expr.matchAll(/['"`](GET|POST|PUT|PATCH|DELETE)['"`]/g)].map(x => x[1]);
            saida.push({
                arquivo: path.relative(RAIZ, arquivo).split(path.sep).join('/'),
                linha: fonte.slice(0, m.index).split('\n').length,
                url: m[2].split('?')[0],
                metodos: expr ? ditos : ['GET'],
            });
        }
    }
    return saida;
}

/** As rotas que podem atender `url` — segmento `${…}` casa com `[param]` ou com qualquer pasta. */
function rotasPara(url: string): string[] {
    const segs = url.replace(/^\/api\//, '').replace(/\/$/, '').split('/');
    let candidatas = [API];
    for (const s of segs) {
        const proximas: string[] = [];
        for (const dir of candidatas) {
            if (!fs.existsSync(dir)) continue;
            const pastas = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
            const variavel = /\$\{/.test(s);
            for (const p of pastas) {
                if (p === s || (variavel && (/^\[.+\]$/.test(p) || s === '${' + s.slice(2, -1) + '}'))) proximas.push(path.join(dir, p));
            }
        }
        candidatas = proximas;
    }
    return candidatas.map(d => path.join(d, 'route.ts')).filter(f => fs.existsSync(f));
}

const exporta = (rota: string, metodo: string) =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${metodo}\\b|export\\s+const\\s+${metodo}\\b`).test(fs.readFileSync(rota, 'utf-8'));

describe('TASK-127 — a tela chama a API com um método que a rota atende', () => {
    it('BDD 1: a varredura enxerga as chamadas (guarda cega é o pior defeito desta série)', () => {
        const cs = chamadas();
        expect(cs.length, 'a varredura não achou as chamadas das telas').toBeGreaterThan(30);
        // As que motivaram a guarda estão entre as vistas.
        expect(cs.some(c => c.url === '/api/history/clear')).toBe(true);
        expect(cs.some(c => c.url === '/api/transactions/${txId}/cancel' && c.metodos.includes('POST'))).toBe(true);
        expect(cs.some(c => c.url === '/api/users' && c.metodos.includes('DELETE'))).toBe(true);
    });

    it('BDD 1: toda chamada tem rota — e a rota exporta o método usado', () => {
        const erros: string[] = [];
        for (const c of chamadas()) {
            const rotas = rotasPara(c.url);
            if (rotas.length === 0) { erros.push(`${c.arquivo}:${c.linha} → ${c.url}: nenhuma rota`); continue; }
            if (c.metodos.length === 0) { erros.push(`${c.arquivo}:${c.linha} → ${c.url}: método não reconhecido`); continue; }
            for (const m of c.metodos) {
                if (!rotas.some(r => exporta(r, m))) erros.push(`${c.arquivo}:${c.linha} → ${m} ${c.url}: a rota não atende ${m}`);
            }
        }
        expect(erros, `chamadas que a API recusa (405/404):\n${erros.join('\n')}`).toEqual([]);
    });

    it('BDD 2: o Limpar Histórico chama DELETE, como o contrato de API diz', () => {
        const c = chamadas().find(x => x.url === '/api/history/clear');
        expect(c?.metodos).toEqual(['DELETE']);
        expect(fs.readFileSync(path.join(RAIZ, 'docs', 'api-contract.md'), 'utf-8'))
            .toMatch(/\|\s*`\/api\/history\/clear`\s*\|\s*`DELETE`\s*\|/);
    });

    it('BDD 3: a guarda reprova o defeito que motivou — prova de que não é cega', () => {
        // Sabotagem em memória: a chamada exatamente como a tela fazia até aqui.
        const rotas = rotasPara('/api/history/clear');
        expect(rotas.length).toBe(1);
        expect(exporta(rotas[0], 'POST'), 'a rota passou a aceitar POST — o contrato diz DELETE').toBe(false);
        expect(exporta(rotas[0], 'DELETE')).toBe(true);
    });
});
