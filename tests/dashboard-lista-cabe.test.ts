import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-121 (REQ-016) — a lista do Dashboard cabe na largura que tem.
//
// ## O que a medição da TASK-119 viu, em 2026-09-11
//
// No Dashboard, a 800 e a 769 px, `.main-content` media 628 px em vez de 540 e 509
// (viewport − 260 da barra lateral) e `document.body.scrollWidth` era 888: a página
// rolava na horizontal. Não havia contêiner de rolagem no caminho — era a grade da
// lista, `.dashboard-list-header`, pedindo 562 px de min-content.
//
// ## O que isso escondia
//
// A página rolar era o sintoma que se vê. Medido em 2026-09-12, com nomes reais de
// tamanho comum ("Ana Beatriz de Souza Cavalcanti"): o conteúdo VAZAVA da própria
// célula em 17 px a 1280, 71 a 1024, 117 a 900 e 123 a 800 — o nome de quem está
// com a chave passava por baixo do botão "Devolver". E cabeçalho e linhas
// desalinhavam em até 55 px.
//
// Dois mecanismos. (1) Cabeçalho e cada linha são grades INDEPENDENTES com o mesmo
// template; trilha `fr` pura é `minmax(auto, fr)`, cujo mínimo vem do conteúdo de
// cada grade — então cada linha calcula colunas diferentes quando aperta. (2) A
// célula do usuário tem `minWidth: 0`, e a trilha dela chegava a 11 px com o
// `UserSelector` (mínimo de 160 px) dentro.
//
// ## Por que não um contêiner com `overflow-x: auto`
//
// Medido: o seletor abre com foco automático no filtro, e o dropdown é `absolute`.
// Dentro de um contêiner de rolagem (que força `overflow-y` a não ser visível), abrir
// o seletor da última linha ROLA A LISTA POR DENTRO em 251 px — as linhas de cima
// somem dentro do card. A lista cabe em vez de rolar.

const RAIZ = process.cwd();
const CSS = fs
    .readFileSync(path.resolve(RAIZ, 'src/app/globals.css'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const DASHBOARD = fs.readFileSync(path.resolve(RAIZ, 'src/app/components/DashboardClient.tsx'), 'utf-8');

const REM = 16;

// A regra BASE começa na coluna 0; as de dentro de `@media`/`@container` vêm indentadas.
function regraBase(seletor: RegExp): string {
    const m = CSS.match(new RegExp(`^${seletor.source}\\s*\\{([^}]*)\\}`, 'm'));
    expect(m, `regra base de ${seletor.source} não encontrada em globals.css`).not.toBeNull();
    return m![1];
}

function propriedade(regra: string, nome: string): string {
    const m = regra.match(new RegExp(`(?:^|;)\\s*${nome}\\s*:\\s*([^;]+)`));
    expect(m, `${nome} ausente`).not.toBeNull();
    return m![1].trim();
}

function px(valor: string): number {
    const m = valor.trim().match(/^([\d.]+)(px|rem)$/);
    expect(m, `"${valor}" não é comprimento em px/rem`).not.toBeNull();
    return Number(m![1]) * (m![2] === 'rem' ? REM : 1);
}

// Divide um template de trilhas no nível de cima (sem quebrar dentro de `minmax(...)`).
function trilhas(template: string): string[] {
    const out: string[] = [];
    let atual = '', nivel = 0;
    for (const ch of template.trim()) {
        if (ch === '(') nivel++;
        if (ch === ')') nivel--;
        if (/\s/.test(ch) && nivel === 0) { if (atual) out.push(atual); atual = ''; continue; }
        atual += ch;
    }
    if (atual) out.push(atual);
    return out;
}

// Mínimo de uma trilha que NÃO depende do conteúdo; null se depender.
function minimoFixo(trilha: string): number | null {
    if (/^[\d.]+(px|rem)$/.test(trilha)) return px(trilha);
    const m = trilha.match(/^minmax\(\s*([\d.]+(?:px|rem)|0)\s*,\s*[\d.]+fr\s*\)$/);
    if (m) return m[1] === '0' ? 0 : px(m[1]);
    return null;
}

// Corpo do bloco `@container <nome> (...)`, andando pelas chaves aninhadas.
function blocoContainer(nome: string): { condicao: string; corpo: string } {
    const m = CSS.match(new RegExp(`@container\\s+${nome}\\s*(\\([^)]*\\))\\s*\\{`));
    expect(m, `@container ${nome} não encontrado em globals.css`).not.toBeNull();
    const inicio = m!.index! + m![0].length;
    let nivel = 1, i = inicio;
    for (; i < CSS.length && nivel > 0; i++) {
        if (CSS[i] === '{') nivel++;
        if (CSS[i] === '}') nivel--;
    }
    return { condicao: m![1], corpo: CSS.slice(inicio, i - 1) };
}

const GRADE = /\.dashboard-list-header,\s*\.dashboard-list-row/;

describe('TASK-121 — a lista do Dashboard cabe na largura que tem (REQ-016)', () => {
    it('BDD 1: a lista é query container de inline-size — o min-content dela não alarga o .main-content', () => {
        const regra = regraBase(/\.dashboard-list/);
        expect(regra, 'sem contenção, a grade empurra o .main-content (item flex, min-width: auto)')
            .toMatch(/(^|;)\s*container\s*:\s*lista-chaves\s*\/\s*inline-size\b/);
    });

    it('BDD 2: o card da lista usa a classe — a regra não fica órfã', () => {
        expect(DASHBOARD).toMatch(/className="dashboard-list"/);
    });

    it('BDD 3: no modo largo, nenhuma trilha tira o mínimo do conteúdo — cabeçalho e linhas alinham sempre', () => {
        // `fr` puro é minmax(auto, fr): o mínimo vem do conteúdo de CADA grade, e
        // cabeçalho e linhas são grades separadas — cada uma calculava colunas próprias.
        const lista = trilhas(propriedade(regraBase(GRADE), 'grid-template-columns'));
        expect(lista).toHaveLength(5);
        for (const t of lista) {
            expect(minimoFixo(t), `trilha "${t}" depende do conteúdo`).not.toBeNull();
        }
    });

    it('BDD 4: a coluna do usuário comporta o UserSelector', () => {
        const seletor = DASHBOARD.match(/const UserSelector[\s\S]*?minWidth:\s*'(\d+)px'/);
        expect(seletor, 'minWidth do UserSelector não encontrado').not.toBeNull();
        const usuario = trilhas(propriedade(regraBase(GRADE), 'grid-template-columns'))[3];
        // Mínimo que depende do conteúdo conta como zero: a célula tem `minWidth: 0`.
        expect(minimoFixo(usuario) ?? 0, `a trilha "${usuario}" é mais estreita que o seletor`)
            .toBeGreaterThanOrEqual(Number(seletor![1]));
    });

    it('BDD 5: o modo largo só vale onde cabe — abaixo do mínimo dele, a lista já está compacta', () => {
        const regra = regraBase(GRADE);
        const soma = trilhas(propriedade(regra, 'grid-template-columns'))
            .reduce((s, t) => s + (minimoFixo(t) ?? 0), 0);
        // padding em quatro valores (topo, direita, base, esquerda), como está hoje.
        const padding = propriedade(regra, 'padding').split(/\s+/);
        expect(padding).toHaveLength(4);
        const minimo = soma + 4 * px(propriedade(regra, 'gap')) + px(padding[1]) + px(padding[3]);

        const { condicao } = blocoContainer('lista-chaves');
        const limite = condicao.match(/max-width\s*:\s*([\d.]+px)/);
        expect(limite, 'o modo compacto precisa de max-width em px').not.toBeNull();
        expect(px(limite![1]) + 1, `o modo largo pede ${minimo}px e vale a partir de ${px(limite![1]) + 1}px`)
            .toBeGreaterThanOrEqual(minimo);
    });

    it('BDD 6: no modo compacto, o cabeçalho sai e cada linha se rearranja em áreas', () => {
        const { corpo } = blocoContainer('lista-chaves');
        expect(corpo).toMatch(/\.dashboard-list-header\s*\{[^}]*display\s*:\s*none/);
        expect(corpo).toMatch(/\.dashboard-list-row\s*\{[^}]*grid-template-areas\s*:/);
    });
});
