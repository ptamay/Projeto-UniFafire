import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-128 (CR Tipo C · ADR-029) — a troca de tela deixa de ter corte seco.
//
// ## O relato
//
// Depois da TASK-125 o menu fica, mas a cada troca de tela o conteúdo vira blocos cinzas de
// uma vez e depois vira a página de uma vez — "seco demais". Era o esqueleto da TASK-096: o
// `loading.tsx` resolveu a tela parada sem sinal, ao preço de APAGAR o conteúdo a cada clique.
//
// ## O que se guarda aqui
//
// A estrutura que produz a troca suave, e que some sem barulho:
//   1. nenhuma `loading.tsx` — uma rota nova nasceria com esqueleto e o corte seco voltaria
//      só nela, sem nenhum teste de tela acusar;
//   2. todo link de navegação leva o indicador — sem ele, sem esqueleto, o clique parece
//      morto até o servidor responder (o problema ORIGINAL da TASK-096);
//   3. a animação de entrada existe, respeita movimento reduzido e não deixa `transform`
//      residual na `.main-content` (bloco de contenção para `position: fixed`).
// O comportamento em si — tela anterior visível na espera, barra, fade — é da E2E
// `tests/e2e/transicao-suave.spec.ts`, contra resposta atrasada.

const RAIZ = process.cwd();
const APP = path.resolve(RAIZ, 'src/app');

const semComentarios = (fonte: string) =>
    fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
const ler = (relativo: string) => fs.readFileSync(path.resolve(RAIZ, relativo), 'utf-8');

function arquivos(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const completo = path.join(dir, e.name);
        return e.isDirectory() ? arquivos(completo) : [completo];
    });
}
const relativo = (f: string) => path.relative(RAIZ, f).split(path.sep).join('/');

/** Blocos `<Link ...>...</Link>` de um arquivo, já sem comentários. */
function blocosDeLink(fonte: string): string[] {
    const blocos: string[] = [];
    const re = /<Link\b[\s\S]*?<\/Link>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte))) blocos.push(m[0]);
    return blocos;
}

describe('TASK-128 — nenhuma tela troca o conteúdo por esqueleto', () => {
    it('BDD 1: não existe `loading.tsx` em `src/app`', () => {
        const encontrados = arquivos(APP).filter(f => /[\\/]loading\.(t|j)sx?$/.test(f)).map(relativo);
        expect(encontrados, `boundary de carregamento traz o corte seco de volta:\n${encontrados.join('\n')}`).toEqual([]);
    });

    it('BDD 1: o `EsqueletoDePagina` saiu, e nada o importa', () => {
        expect(fs.existsSync(path.resolve(APP, 'components/EsqueletoDePagina.tsx'))).toBe(false);
        const importadores = arquivos(path.resolve(RAIZ, 'src'))
            .filter(f => /\.(tsx?|jsx?)$/.test(f))
            .filter(f => /EsqueletoDePagina/.test(semComentarios(fs.readFileSync(f, 'utf-8'))))
            .map(relativo);
        expect(importadores).toEqual([]);
    });
});

describe('TASK-128 — o clique responde na hora', () => {
    const INDICADOR = 'src/app/components/IndicadorDeNavegacao.tsx';

    it('BDD 2: o indicador lê o estado do próprio link e desenha a barra do topo', () => {
        const fonte = semComentarios(ler(INDICADOR));
        expect(fonte).toMatch(/^['"]use client['"]/);
        expect(fonte, 'o indicador não lê `useLinkStatus`').toMatch(/useLinkStatus\s*\(\s*\)/);
        expect(fonte, 'o item clicado não é marcado').toMatch(/className=["']nav-pendente["']/);
        expect(fonte, 'a barra do topo não é desenhada').toMatch(/className=["']barra-navegacao["']/);
        // Portal: a barra é `fixed` no topo, e dentro do menu (que no celular tem `transform`
        // no drawer) ela ficaria presa à caixa dele.
        expect(fonte, 'a barra não sai do menu por portal').toMatch(/createPortal\(/);
    });

    it('BDD 2: TODO link do menu leva o indicador — lateral, conta e barra do celular', () => {
        const blocos = blocosDeLink(semComentarios(ler('src/app/components/Sidebar.tsx')));
        // Menu lateral (um map), Meu Perfil, Segurança e a barra inferior (um map): quatro.
        expect(blocos.length, 'o número de links do menu mudou — revisar este cenário').toBe(4);
        const sem = blocos.filter(b => !/<IndicadorDeNavegacao\s*\/>/.test(b)).map(b => b.slice(0, 90));
        expect(sem, `links sem indicador (o clique pareceria morto):\n${sem.join('\n')}`).toEqual([]);
    });

    it('BDD 2: o "Cadastrar chave" do Dashboard é link com indicador, não `router.push`', () => {
        const fonte = semComentarios(ler('src/app/components/DashboardClient.tsx'));
        expect(fonte, 'o Dashboard ainda navega por `router.push`').not.toMatch(/router\.push\(\s*['"]\/keys['"]/);
        const bloco = blocosDeLink(fonte).find(b => /href=["']\/keys["']/.test(b));
        expect(bloco, 'não há link para /keys no Dashboard').toBeDefined();
        expect(bloco!).toMatch(/<IndicadorDeNavegacao\s*\/>/);
    });
});

describe('TASK-128 — a tela nova entra suave', () => {
    const css = () => semComentarios(ler('src/app/globals.css'));

    /** Corpo do bloco `@media (prefers-reduced-motion: reduce)` que contém `seletor`. */
    const blocosReduzidos = (fonte: string) => {
        const out: string[] = [];
        const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(fonte))) {
            let i = m.index + m[0].length, nivel = 1;
            while (nivel && i < fonte.length) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') nivel--; i++; }
            out.push(fonte.slice(m.index, i));
        }
        return out;
    };

    it('BDD 3: a `.main-content` entra com a animação `entrar-tela`', () => {
        const fonte = css();
        expect(fonte, 'não há @keyframes entrar-tela').toMatch(/@keyframes\s+entrar-tela\s*\{/);
        expect(fonte, 'a `.main-content` não anima a entrada')
            .toMatch(/\.main-content\s*\{[^}]*animation:\s*entrar-tela\b[^;]*;/);
    });

    it('BDD 3: a animação não deixa `transform` residual na `.main-content`', () => {
        // `forwards`/`both` manteriam o estado final aplicado — e qualquer `transform` que não
        // seja `none` torna a `.main-content` bloco de contenção de todo `position: fixed`
        // dentro dela (modais). O estado final é o normal do elemento, então não precisa.
        const regra = css().match(/\.main-content\s*\{[^}]*animation:\s*entrar-tela\b[^;]*;/)?.[0] ?? '';
        // Sem a regra, o cenário passaria sem ter olhado nada.
        expect(regra, 'a regra de entrada da `.main-content` não existe').not.toBe('');
        expect(regra).not.toMatch(/\b(forwards|both)\b/);
        expect(css()).not.toMatch(/\.main-content\s*\{[^}]*animation-fill-mode/);
    });

    it('BDD 4: com movimento reduzido, nem fade nem barra animada', () => {
        const reduzidos = blocosReduzidos(css()).join('\n');
        expect(reduzidos, 'reduced-motion não desliga a entrada da tela')
            .toMatch(/\.main-content\s*\{[^}]*animation:\s*none/);
        expect(reduzidos, 'reduced-motion não desliga a barra animada')
            .toMatch(/\.barra-navegacao\s*\{[^}]*animation:\s*none/);
    });

    it('BDD 2: o item clicado ganha o estilo de ativo, nos dois temas e no celular', () => {
        const fonte = css();
        expect(fonte).toMatch(/\.nav-item:has\(>\s*\.nav-pendente\)/);
        expect(fonte).toMatch(/\.light-mode \.sidebar \.nav-item:has\(>\s*\.nav-pendente\)/);
        expect(fonte).toMatch(/\.bottom-nav-item:has\(>\s*\.nav-pendente\)/);
    });
});
