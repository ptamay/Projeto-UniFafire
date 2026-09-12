import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-119 (REQ-016) — a tabela rola dentro do próprio contêiner, não a página.
//
// ## O que a varredura da TASK-117 viu, em 2026-09-10
//
// Em `/users`, a 1280 px, `.main-content` media 1146 px em vez de 1020 (1280 − 260 da
// barra lateral) e `document.body.scrollWidth` era 1406: a página rolava na horizontal,
// que o REQ-016 proíbe.
//
// ## O que isso escondia
//
// Não era só o `/users`. Medido em 2026-09-11 nas nove telas, de 1280 a 769 px:
// `/history`, `/logs` e `/keys` estouram igual entre 769 e 1024 px. O `/users` era só o
// primeiro a estourar, porque a coluna de ações (três botões `nowrap`) pede 372 px.
//
// O mecanismo é um só. `.main-content` é item flex do `.page-wrapper` com
// `min-width: auto`: ele não encolhe abaixo do min-content dos filhos. O `.table-wrapper`
// tem `overflow-x: auto` justamente para a tabela rolar por dentro — mas o min-content
// da tabela VAZA pelo contêiner de rolagem e alarga o `.main-content`, então a rolagem
// interna nunca acontecia. Quem rolava era a página.
//
// ## Por que não `min-width: 0` no `.main-content`
//
// Resolveria as quatro telas, e cortaria o conteúdo de outras: o `.main-content` tem
// `overflow-x: clip`, e o que excede um item que não pode mais crescer é CORTADO, não
// rolado. O Dashboard a 769–800 px estoura por uma grade sem contêiner de rolagem
// (`.dashboard-list-header`) — com `min-width: 0`, as colunas da direita sumiriam em
// silêncio. A correção fica na origem: quem tem para onde rolar deixa de empurrar.

const RAIZ = process.cwd();
const CSS = fs
    .readFileSync(path.resolve(RAIZ, 'src/app/globals.css'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

// A regra BASE começa na coluna 0; as de dentro de `@media` vêm indentadas.
function regraBase(seletor: string): string {
    const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = CSS.match(new RegExp(`^${escapado}\\s*\\{([^}]*)\\}`, 'm'));
    expect(m, `regra base de ${seletor} não encontrada em globals.css`).not.toBeNull();
    return m![1];
}

describe('TASK-119 — a tabela rola dentro do próprio contêiner (REQ-016)', () => {
    it('BDD 1: o .table-wrapper não empresta o min-content da tabela ao .main-content', () => {
        // `contain: inline-size` faz a largura intrínseca do contêiner ignorar o
        // conteúdo: ele ocupa a largura que o pai dá, e a tabela rola dentro dele.
        expect(regraBase('.table-wrapper'), 'sem contenção, a tabela alarga a página')
            .toMatch(/(^|;)\s*contain\s*:\s*[^;]*\binline-size\b/);
    });

    it('BDD 2: o .table-wrapper continua sendo contêiner de rolagem', () => {
        // Sem `overflow-x: auto`, a contenção faria a tabela transbordar o contêiner — e
        // o `overflow-x: clip` do `.main-content` cortaria as colunas da direita.
        expect(regraBase('.table-wrapper')).toMatch(/(^|;)\s*overflow-x\s*:\s*auto\b/);
    });
});
