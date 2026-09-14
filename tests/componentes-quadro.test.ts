import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-133 (ADR-031 · REQ-033) — os componentes globais do mundo "quadro de chaves".
//
// O usuário leu o sistema como "slop de IA", e a causa estava prescrita no DESIGN.md
// antigo: botão com gradiente que sobe e brilha no hover, sombra em todo cartão, bolinha
// "com luz acesa" nas etiquetas, rótulo em MAIÚSCULAS espaçadas, emoji no lugar de ícone.
// No quadro de chaves da portaria, cada chave é uma plaqueta num gancho, lida de longe
// sem instrução: superfície plana, cor que significa sempre a mesma coisa, um botão de
// ação que salta aos olhos. Esta guarda impede o visual antigo de voltar aos poucos.

const RAIZ = process.cwd();
const SRC = path.join(RAIZ, 'src');
const GLOBALS = path.join(SRC, 'app/globals.css');

function arquivos(dir: string, ext: RegExp): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? arquivos(p, ext) : ext.test(e.name) ? [p] : [];
    });
}

const rel = (p: string) => path.relative(RAIZ, p).replace(/\\/g, '/');
const semComentarioCss = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
/** Tira comentários de TS/TSX (bloco, JSX e linha) — exemplo em comentário não conta. */
const semComentarioTs = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const CSS = () => arquivos(SRC, /\.css$/).map(f => ({ f, texto: semComentarioCss(fs.readFileSync(f, 'utf-8')) }));
const TSX = () => arquivos(SRC, /\.tsx$/).map(f => ({ f, texto: semComentarioTs(fs.readFileSync(f, 'utf-8')) }));

/** Regras de um CSS como pares seletor → corpo, com o @media em que estão (se algum). */
function regras(css: string): { seletor: string; corpo: string; media: string | null }[] {
    const saida: { seletor: string; corpo: string; media: string | null }[] = [];
    const varrer = (texto: string, media: string | null) => {
        let i = 0;
        while (i < texto.length) {
            const abre = texto.indexOf('{', i);
            if (abre < 0) break;
            const cabeca = texto.slice(i, abre).trim();
            let nivel = 1, j = abre + 1;
            while (j < texto.length && nivel > 0) { if (texto[j] === '{') nivel++; else if (texto[j] === '}') nivel--; j++; }
            const corpo = texto.slice(abre + 1, j - 1);
            if (cabeca.startsWith('@media') || cabeca.startsWith('@container') || cabeca.startsWith('@supports')) varrer(corpo, cabeca);
            else if (!cabeca.startsWith('@')) saida.push({ seletor: cabeca, corpo, media });
            i = j;
        }
    };
    varrer(css, null);
    return saida;
}

/** Divide uma lista de valores CSS pelas vírgulas de fora dos parênteses. */
function camadas(valor: string): string[] {
    const partes: string[] = []; let nivel = 0, atual = '';
    for (const c of valor) {
        if (c === '(') nivel++;
        if (c === ')') nivel--;
        if (c === ',' && nivel === 0) { partes.push(atual.trim()); atual = ''; } else atual += c;
    }
    if (atual.trim()) partes.push(atual.trim());
    return partes;
}

/** A sombra permitida: nenhuma, a elevação única, ou um anel de foco (só espalhamento, sem desfoque). */
const sombraPermitida = (v: string) => {
    const valor = v.replace(/\s*!important$/, '').trim();
    if (/^(none|var\(--elevacao\))$/.test(valor)) return true;
    return camadas(valor).every(c => /^(inset\s+)?0(px)?\s+0(px)?\s+0(px)?\s+\d+(\.\d+)?(px|rem)\s+\S.*$/.test(c));
};

// ── Cor: leitura dos tokens e contraste WCAG ─────────────────────────────────

type Rgba = [number, number, number, number];

function bloco(css: string, seletor: RegExp): string {
    const m = seletor.exec(css);
    if (!m) return '';
    let nivel = 1, j = m.index + m[0].length;
    while (j < css.length && nivel > 0) { if (css[j] === '{') nivel++; else if (css[j] === '}') nivel--; j++; }
    return css.slice(m.index + m[0].length, j - 1);
}

function tokens(texto: string): Record<string, string> {
    const t: Record<string, string> = {};
    for (const m of texto.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) t[m[1]] = m[2].trim();
    return t;
}

function paleta(tema: 'escuro' | 'claro'): Record<string, string> {
    const css = semComentarioCss(fs.readFileSync(GLOBALS, 'utf-8'));
    const base = tokens(bloco(css, /(^|\n):root\s*\{/));
    return tema === 'escuro' ? base : { ...base, ...tokens(bloco(css, /(^|\n)\.light-mode\s*\{/)) };
}

function cor(valor: string | undefined, t: Record<string, string>, fundo?: Rgba): Rgba {
    if (valor === undefined) throw new Error('cor de token ausente');
    const v = valor.replace(/\s*!important$/, '').trim();
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    if (ref) {
        if (!t[ref[1]]) throw new Error(`token ${ref[1]} não definido`);
        return cor(t[ref[1]], t, fundo);
    }
    const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    let c: Rgba;
    if (hex) {
        const h = hex[1].length === 3 ? hex[1].split('').map(x => x + x).join('') : hex[1];
        c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
    } else {
        const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
        if (!m) throw new Error(`cor ilegível: ${v}`);
        c = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    }
    if (c[3] < 1 && fundo) c = [0, 1, 2].map(i => Math.round(c[i] * c[3] + fundo[i] * (1 - c[3]))).concat(1) as Rgba;
    return c;
}

const luminancia = ([r, g, b]: Rgba) => {
    const [R, G, B] = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const contraste = (a: Rgba, b: Rgba) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
};
function matiz([r, g, b]: Rgba): { h: number; s: number } {
    const [R, G, B] = [r, g, b].map(v => v / 255);
    const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
    const l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0) h = max === R ? 60 * (((G - B) / d) % 6) : max === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
    return { h: (h + 360) % 360, s };
}
const distanciaDeMatiz = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const TOKENS_DE_ESTADO = ['livre', 'em-uso', 'pendente', 'alerta'] as const;

describe('TASK-133 — superfícies planas: sem gradiente, sem brilho, uma elevação só', () => {
    it('nenhum gradiente em CSS ou componente', () => {
        const achados = [...CSS(), ...TSX()].flatMap(({ f, texto }) =>
            [...texto.matchAll(/(linear|radial|conic)-gradient\(/g)].map(() => rel(f)));
        expect(achados, `gradiente em:\n${[...new Set(achados)].join('\n')}`).toEqual([]);
    });

    it('toda sombra é a elevação única, um anel de foco ou nenhuma — brilho e sombra de repouso não existem', () => {
        const fora: string[] = [];
        for (const { f, texto } of CSS()) {
            for (const r of regras(texto)) {
                for (const m of r.corpo.matchAll(/(?<![-\w])box-shadow\s*:\s*([^;]+)/g)) {
                    if (!sombraPermitida(m[1])) fora.push(`${rel(f)} ${r.seletor} → ${m[1].trim()}`);
                }
            }
        }
        for (const { f, texto } of TSX()) {
            for (const m of texto.matchAll(/boxShadow:\s*([^,}\n]+)/g)) {
                const valores = [...m[1].matchAll(/'([^']*)'|`([^`]*)`/g)].map(v => v[1] ?? v[2]);
                if (valores.length === 0 || !valores.every(sombraPermitida)) fora.push(`${rel(f)} boxShadow: ${m[1].trim()}`);
            }
        }
        expect(fora, `sombras fora da regra:\n${fora.join('\n')}`).toEqual([]);
    });

    it('a elevação existe como token e só o que flutua a usa (modal, menu, lista suspensa, gaveta aberta, dica)', () => {
        const raiz = paleta('escuro');
        expect(raiz['--elevacao'], 'falta --elevacao no :root').toBeTruthy();
        const FLUTUA = /modal|menu|dropdown|folha|tooltip|toast|sidebar\.open|lista-flutuante|data-tooltip/;
        const fora: string[] = [];
        for (const { f, texto } of CSS()) {
            for (const r of regras(texto)) {
                if (/var\(--elevacao\)/.test(r.corpo) && !FLUTUA.test(r.seletor)) fora.push(`${rel(f)} ${r.seletor}`);
            }
        }
        // No componente, só em estilo de elemento posicionado por cima dos outros.
        for (const { f, texto } of TSX()) {
            for (const m of texto.matchAll(/var\(--elevacao\)/g)) {
                const inicio = texto.lastIndexOf('style={{', m.index!);
                const fim = texto.indexOf('}}', m.index!);
                if (!/position:\s*'(absolute|fixed)'/.test(texto.slice(inicio, fim))) fora.push(`${rel(f)} (elemento não flutua)`);
            }
        }
        expect(fora, `elevação em quem não flutua:\n${fora.join('\n')}`).toEqual([]);
    });

    it('os tokens de sombra antigos (--shadow-*) saíram — eles eram a sombra de repouso', () => {
        const restos = [...CSS(), ...TSX()].filter(({ texto }) => /--shadow-/.test(texto)).map(({ f }) => rel(f));
        expect(restos).toEqual([]);
    });

    it('no celular, o cartão que embrulha a página fica plano — nunca cartão dentro de cartão', () => {
        const r = regras(semComentarioCss(fs.readFileSync(GLOBALS, 'utf-8')))
            .filter(x => x.media?.includes('max-width: 768px') && /\.main-content\s*>\s*\.card\b/.test(x.seletor));
        expect(r.length, 'falta a regra .main-content > .card no bloco do celular').toBeGreaterThan(0);
        const corpo = r.map(x => x.corpo).join(';');
        expect(corpo).toMatch(/background\s*:\s*(none|transparent)/);
        expect(corpo).toMatch(/border\s*:\s*(none|0)/);
        expect(corpo).toMatch(/padding\s*:\s*0\s*[;}]?/);
    });
});

describe('TASK-133 — botões sólidos: 48 px o principal, 40 px os outros', () => {
    it('os tamanhos são tokens: --btn-h 40 px e --btn-h-principal 48 px', () => {
        const t = paleta('escuro');
        expect(t['--btn-h']).toBe('2.5rem');
        expect(t['--btn-h-principal']).toBe('3rem');
    });

    it('.btn tem a altura secundária e o principal a sua, com a cor de ação', () => {
        const r = regras(semComentarioCss(fs.readFileSync(GLOBALS, 'utf-8'))).filter(x => !x.media);
        const btn = r.filter(x => /(^|,)\s*\.btn\s*(,|$)/.test(x.seletor)).map(x => x.corpo).join(';');
        expect(btn).toMatch(/min-height\s*:\s*var\(--btn-h\)/);
        const principal = r.filter(x => /\.btn-principal\b/.test(x.seletor) && !/:/.test(x.seletor)).map(x => x.corpo).join(';');
        expect(principal, 'falta a regra .btn-principal').toMatch(/min-height\s*:\s*var\(--btn-h-principal\)/);
        expect(principal).toMatch(/background\s*:\s*var\(--acao\)/);
        expect(principal).toMatch(/color\s*:\s*var\(--acao-texto\)/);
    });

    it('no celular, o principal continua com 48 px (a regra de toque de 44 px não o encolhe)', () => {
        const r = regras(semComentarioCss(fs.readFileSync(GLOBALS, 'utf-8'))).filter(x => x.media?.includes('max-width: 768px'));
        const principal = r.filter(x => /\.btn-principal\b/.test(x.seletor)).map(x => x.corpo).join(';');
        expect(principal).toMatch(/min-height\s*:\s*var\(--btn-h-principal\)/);
    });

    it('botão não sobe nem encolhe no hover/toque, e não anima "tudo"', () => {
        const fora: string[] = [];
        for (const { f, texto } of CSS()) {
            for (const r of regras(texto)) {
                if (!/\.btn\b/.test(r.seletor)) continue;
                const t = r.corpo.match(/(?<![-\w])transform\s*:\s*([^;]+)/);
                if (t && !/^none(\s*!important)?$/.test(t[1].trim())) fora.push(`${rel(f)} ${r.seletor} transform: ${t[1].trim()}`);
                if (/transition\s*:\s*all\b/.test(r.corpo)) fora.push(`${rel(f)} ${r.seletor} transition: all`);
            }
        }
        expect(fora, `botão que se mexe:\n${fora.join('\n')}`).toEqual([]);
    });
});

describe('TASK-133 — cor com significado fixo', () => {
    const NOMES = ['--acao', '--acao-hover', '--acao-texto', '--acao-bg',
        '--alerta', '--alerta-hover', '--alerta-texto', '--pendente', '--pendente-texto',
        ...TOKENS_DE_ESTADO.flatMap(e => [`--${e}-fg`, `--${e}-bg`])];

    it('os tokens de ação e de estado (livre, em uso, pendente, alerta) existem nos dois temas', () => {
        const css = semComentarioCss(fs.readFileSync(GLOBALS, 'utf-8'));
        const claro = tokens(bloco(css, /(^|\n)\.light-mode\s*\{/));
        const escuro = paleta('escuro');
        for (const n of NOMES) {
            expect(escuro[n], `${n} ausente no :root`).toBeTruthy();
            expect(claro[n], `${n} ausente no .light-mode`).toBeTruthy();
        }
    });

    it('os nomes antigos saíram — uma cor, um nome (status-*, warning, danger, accent-*, text-green, bg-selection)', () => {
        const ANTIGOS = /--(status-available|status-inuse|warning|danger|accent-primary|accent-hover|text-green|bg-selection)\b/;
        const restos = [...CSS(), ...TSX()].flatMap(({ f, texto }) => {
            const m = texto.match(new RegExp(ANTIGOS.source, 'g'));
            return m ? [`${rel(f)}: ${[...new Set(m)].join(', ')}`] : [];
        });
        expect(restos, `tokens antigos ainda em uso:\n${restos.join('\n')}`).toEqual([]);
    });

    it.each(['escuro', 'claro'] as const)('tema %s: "em uso" não é vermelho — vermelho é só alerta e o que apaga', tema => {
        const t = paleta(tema);
        const { h, s } = matiz(cor(t['--em-uso-fg'], t));
        const vermelho = s > 0.3 && (h < 20 || h > 330);
        expect(vermelho, `--em-uso-fg em ${tema} é vermelho (matiz ${h.toFixed(0)}°)`).toBe(false);
    });

    it.each(['escuro', 'claro'] as const)('tema %s: a cor de ação é distinta das cores de estado', tema => {
        const t = paleta(tema);
        const acao = matiz(cor(t['--acao'], t)).h;
        for (const e of ['livre', 'pendente', 'alerta']) {
            const h = matiz(cor(t[`--${e}-fg`], t)).h;
            expect(distanciaDeMatiz(acao, h), `ação e ${e} com matiz parecido em ${tema}`).toBeGreaterThanOrEqual(60);
        }
    });

    it.each(['escuro', 'claro'] as const)('tema %s: contraste AA — texto de estado sobre a etiqueta, ação, texto apagado', tema => {
        const t = paleta(tema);
        const cartao = cor(t['--bg-card'], t);
        const pagina = cor(t['--bg-page'], t);
        const pares: [string, Rgba, Rgba][] = [
            ...TOKENS_DE_ESTADO.map(e => [`--${e}-fg sobre --${e}-bg`, cor(t[`--${e}-fg`], t), cor(t[`--${e}-bg`], t, cartao)] as [string, Rgba, Rgba]),
            ['--acao-texto sobre --acao', cor(t['--acao-texto'], t), cor(t['--acao'], t)],
            ['--acao-texto sobre --acao-hover', cor(t['--acao-texto'], t), cor(t['--acao-hover'], t)],
            ['--alerta-texto sobre --alerta (botão de apagar)', cor(t['--alerta-texto'], t), cor(t['--alerta'], t)],
            ['--alerta-texto sobre --alerta-hover', cor(t['--alerta-texto'], t), cor(t['--alerta-hover'], t)],
            ['--pendente-texto sobre --pendente (contador)', cor(t['--pendente-texto'], t), cor(t['--pendente'], t)],
            ['--text-muted sobre --bg-page', cor(t['--text-muted'], t), pagina],
            ['--text-muted sobre --bg-card', cor(t['--text-muted'], t), cartao],
            ['--text-secondary sobre --bg-page', cor(t['--text-secondary'], t), pagina],
        ];
        const fracos = pares.filter(([, a, b]) => contraste(a, b) < 4.5).map(([n, a, b]) => `${n}: ${contraste(a, b).toFixed(2)}`);
        expect(fracos, `abaixo de 4,5:1 no tema ${tema}:\n${fracos.join('\n')}`).toEqual([]);
    });

    it('vermelho (--alerta-*) só em regra de alerta, erro ou do que apaga', () => {
        const PODE = /alerta|atras|erro|ruim|perigo|danger|remov|exclu|apag|limpar|sair|logout|invalid/;
        const fora: string[] = [];
        let usos = 0;
        for (const { f, texto } of CSS()) {
            for (const r of regras(texto)) {
                if (!/var\(--alerta/.test(r.corpo) || /^:root$|^\.light-mode$/.test(r.seletor)) continue;
                usos++;
                if (!PODE.test(r.seletor)) fora.push(`${rel(f)} ${r.seletor}`);
            }
        }
        // Sem uso nenhum, a regra passaria vazia — o botão de apagar tem de ser vermelho por ela.
        expect(usos, 'nenhuma regra usa --alerta: a guarda estaria olhando para o nada').toBeGreaterThan(0);
        const perigo = regras(semComentarioCss(fs.readFileSync(GLOBALS, 'utf-8')))
            .filter(x => /\.btn-perigo\b/.test(x.seletor) && !/:/.test(x.seletor)).map(x => x.corpo).join(';');
        expect(perigo, 'o botão de apagar (.btn-perigo) é vermelho pelo token').toMatch(/background\s*:\s*var\(--alerta\)/);
        expect(fora, `vermelho fora de alerta:\n${fora.join('\n')}`).toEqual([]);
    });

    it('etiqueta de status e contador da barra inferior sem vermelho: pendência é âmbar, não alarme', () => {
        const r = regras(semComentarioCss(fs.readFileSync(GLOBALS, 'utf-8')));
        const badge = r.filter(x => /\.bottom-nav-badge\b/.test(x.seletor)).map(x => x.corpo).join(';');
        expect(badge).toMatch(/background\s*:\s*var\(--pendente/);
        const emUso = r.filter(x => /\.status-inuse\b/.test(x.seletor)).map(x => x.corpo).join(';');
        expect(emUso).toMatch(/var\(--em-uso-fg\)/);
    });
});

describe('TASK-133 — rótulos em caixa normal', () => {
    it('nenhum text-transform: uppercase em CSS (arquivo ou <style jsx>) nem textTransform em componente', () => {
        const achados = [
            ...CSS().flatMap(({ f, texto }) => /text-transform\s*:\s*uppercase/.test(texto) ? [rel(f)] : []),
            ...TSX().flatMap(({ f, texto }) =>
                /textTransform:\s*['"]uppercase['"]|text-transform\s*:\s*uppercase/.test(texto) ? [rel(f)] : []),
        ];
        expect(achados, `maiúsculas forçadas em:\n${achados.join('\n')}`).toEqual([]);
    });

    it('nenhum espaçamento de letras aberto (≥ 0,04 em) — o par das maiúsculas espaçadas', () => {
        const achados: string[] = [];
        for (const { f, texto } of [...CSS(), ...TSX()]) {
            for (const m of texto.matchAll(/letter-?[sS]pacing\s*:\s*['"]?([\d.]+)em/g)) {
                if (Number(m[1]) >= 0.04) achados.push(`${rel(f)} ${m[0]}`);
            }
        }
        expect(achados, `espaçamento aberto:\n${achados.join('\n')}`).toEqual([]);
    });
});

describe('TASK-133 — ícones desenhados, não emoji', () => {
    it('nenhum emoji no código das telas (fora de comentários)', () => {
        const achados = TSX().flatMap(({ f, texto }) =>
            [...texto.matchAll(/\p{Extended_Pictographic}/gu)].map(m => `${rel(f)} ${m[0]}`));
        expect(achados, `emoji no lugar de ícone:\n${achados.join('\n')}`).toEqual([]);
    });
});

describe('TASK-133 — barra do topo e barra inferior', () => {
    it('no celular, o título da página sai da vista (a barra do topo já diz o nome) mas fica para o leitor de tela', () => {
        const r = regras(semComentarioCss(fs.readFileSync(GLOBALS, 'utf-8')))
            .filter(x => x.media?.includes('max-width: 768px') && /\.page-title\b/.test(x.seletor));
        const corpo = r.map(x => x.corpo).join(';');
        // Oculto por recorte, não por display: none — o h1 continua sendo o título da página.
        expect(corpo, 'o .page-title precisa ser recortado no celular').toMatch(/clip-path\s*:\s*inset\(50%\)/);
        expect(corpo).not.toMatch(/display\s*:\s*none/);
    });

    it('o "?" e o tema ficam juntos, à direita da barra do topo', () => {
        const fonte = fs.readFileSync(path.join(SRC, 'app/components/Sidebar.tsx'), 'utf-8');
        const topo = fonte.slice(fonte.indexOf('className="mobile-topbar"'), fonte.indexOf('className="mobile-bottom-nav"'));
        const acoes = topo.slice(topo.indexOf('className="mobile-topbar-acoes"'));
        expect(topo, 'falta o agrupador .mobile-topbar-acoes').toMatch(/className="mobile-topbar-acoes"/);
        expect(acoes).toMatch(/Abrir tutorial \(ajuda\)/);
        expect(acoes).toMatch(/toggleTheme/);
    });
});
