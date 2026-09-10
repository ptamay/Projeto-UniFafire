import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-117 (REQ-016) — no celular, o Dashboard de ALUNO e FUNCIONARIO saía cortado
// na borda direita: título, subtítulo, os dois cards de contagem e a busca.
//
// ## A causa, medida
//
// `.main-content` é item flex do `.page-wrapper` (`display: flex`), e item flex tem
// `min-width: auto` — não encolhe abaixo do min-content dos filhos. A barra de filtros
// de quem porta chave tem QUATRO chips (`Minhas Chaves`, `Todas`, `Disponíveis`,
// `Em Uso`), `nowrap` e `flex: 0 0 auto` desde a `895dbfc`: 131 + 73 + 108 + 82 +
// 3 × 12 de gap = **430 px** de min-content. Mais 2 × 16 de padding, o `main` fica em
// **462 px** em qualquer tela até essa largura — medido em 360, 375, 390 e 412, no
// painel e no Chromium do Playwright com `isMobile`. O `overflow-x: clip` do `main` e
// o `overflow-x: hidden` do `html` escondem a sobra em vez de rolar: é corte, não scroll.
//
// A `895dbfc` pôs `overflow-x: auto` na barra justamente para ela rolar sozinha. Ela
// nunca rolou — o `main` crescia antes. `clip` não resolve porque, ao contrário de
// `hidden`, não faz do `main` um container de rolagem, e só container de rolagem zera
// o `min-width: auto` de item flex.
//
// ## Por que PORTEIRO e ADMIN não viam
//
// Eles têm três chips (sem `Minhas Chaves`), ~300 px, e cabem. O defeito é exatamente
// dos papéis mais numerosos do sistema.
//
// ## Por que nenhuma guarda pegou
//
// `expectNoHorizontalScroll` (tests/e2e/helpers.ts) mede
// `document.documentElement.scrollWidth` — que, com `html { overflow-x: hidden }` no
// bloco mobile, é SEMPRE a largura da viewport. Medido: `doc` = 375, `body` = 462.
// E a suíte E2E ainda aponta para o SQLite que saiu na Sprint 21.
//
// Esta guarda é textual porque o vitest não calcula layout. Ela não prova a tela —
// a prova é a medição no navegador registrada na task; ela impede que a regra suma.

const RAIZ = process.cwd();
const CSS = fs.readFileSync(path.resolve(RAIZ, 'src/app/globals.css'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** Corpo de cada `@media (max-width: 768px) { ... }`, na ordem do arquivo. */
function blocosMobile(css: string): string[] {
    const blocos: string[] = [];
    const abre = /@media\s*\(max-width:\s*768px\)\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = abre.exec(css))) {
        let profundidade = 1;
        let i = abre.lastIndex;
        while (profundidade > 0 && i < css.length) {
            if (css[i] === '{') profundidade++;
            else if (css[i] === '}') profundidade--;
            i++;
        }
        blocos.push(css.slice(abre.lastIndex, i - 1));
    }
    return blocos;
}

/** Valores de `propriedade` nas regras cujo seletor é exatamente `seletor`, em ordem. */
function valores(css: string, seletor: string, propriedade: string): string[] {
    const achados: string[] = [];
    for (const regra of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const seletores = regra[1].split(',').map(s => s.trim());
        if (!seletores.includes(seletor)) continue;
        for (const decl of regra[2].split(';')) {
            const [prop, ...resto] = decl.split(':');
            if (prop?.trim() === propriedade) achados.push(resto.join(':').trim());
        }
    }
    return achados;
}

const foraDoMobile = blocosMobile(CSS).reduce((css, bloco) => css.replace(bloco, ''), CSS);

describe('TASK-117 — no celular, o conteúdo cabe na tela em vez de ser cortado', () => {
    it('premissa: .main-content é item flex do .page-wrapper', () => {
        // Se isto mudar, a regra abaixo pode ter deixado de ser necessária — ou de
        // bastar. Reveja a medição antes de mexer em qualquer uma das duas.
        expect(valores(foraDoMobile, '.page-wrapper', 'display')).toContain('flex');
        expect(valores(foraDoMobile, '.main-content', 'flex')).toContain('1');
    });

    it('a varredura enxerga o bloco mobile (senão os cenários abaixo passariam cegos)', () => {
        // A regra mobile que já existia antes desta task tem de ser encontrada.
        const margens = blocosMobile(CSS).flatMap(b => valores(b, '.main-content', 'margin-left'));
        expect(margens).toContain('0');
    });

    it('BDD: no bloco mobile, .main-content pode encolher abaixo do min-content dos filhos', () => {
        // Last-wins: vale a ÚLTIMA declaração entre os blocos mobile.
        const declarados = blocosMobile(CSS).flatMap(b => valores(b, '.main-content', 'min-width'));
        expect(declarados.at(-1) ?? '(ausente)', '.main-content precisa de min-width: 0 no mobile').toMatch(/^0(px)?$/);
    });

    it('a correção é aditiva: o desktop não ganha min-width no .main-content', () => {
        expect(valores(foraDoMobile, '.main-content', 'min-width')).toEqual([]);
    });
});
