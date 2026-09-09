import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-096 (CR Tipo C · ADR-018) — a troca de abas deixa de parecer travada.
//
// ## As duas causas, e elas se reforçam
//
// 1. **Nenhuma rota tem `loading.tsx`.** Todas as páginas são dinâmicas (`ƒ` no
//    `next build`, porque todas leem o cookie de sessão). Sem *loading boundary*, o
//    navegador fica com a **tela anterior parada** até o servidor terminar de
//    renderizar. Nada indica que algo está acontecendo, então a impressão é de
//    travamento — e o usuário clica de novo.
//
// 2. **O menu navega com `router.push()`, não com `<Link>`.** O `<Link>` do Next
//    faz *prefetch* da rota; com `router.push` cada clique começa do zero.
//
// A correção de uma habilita a outra: com `loading.tsx` presente, o prefetch de
// rota dinâmica busca **só até o boundary** — barato, e é justamente o que faz a
// transição parecer imediata.
//
// ## O que este arquivo NÃO consegue provar
//
// Que ficou mais rápido. Isso é medição, e está no `plan.md` — o critério de aceite
// do ADR-018 é número, não "parece melhor". O que se guarda aqui é a ESTRUTURA que
// produz o número, e que some sem barulho: uma rota nova nasce sem `loading.tsx` e
// ninguém percebe, porque a página funciona.

const RAIZ = process.cwd();
const APP = path.resolve(RAIZ, 'src/app');

const semComentarios = (arquivo: string) =>
    fs.readFileSync(arquivo, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function rotasComPagina(): { rota: string; dir: string }[] {
    const achados: { rota: string; dir: string }[] = [];
    const varrer = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory() && e.name !== 'api') varrer(p);
            else if (e.name === 'page.tsx') {
                const rel = path.relative(APP, dir).split(path.sep).join('/');
                achados.push({ rota: rel ? `/${rel}` : '/', dir });
            }
        }
    };
    varrer(APP);
    return achados;
}

describe('TASK-096 — toda rota mostra que está carregando', () => {
    // Exceções em LISTA, com o motivo escrito. Rota sem boundary é rota que fica
    // com a tela anterior parada, e isso tem de ser decisão, não descuido.
    const EXCECOES: Record<string, string> = {
        '/login': 'estática (`○` no build) — servida da borda, não espera servidor',
    };

    it('BDD 1: nenhuma rota dinâmica fica sem `loading.tsx`', () => {
        const sem = rotasComPagina()
            .filter(r => !(r.rota in EXCECOES))
            .filter(r => !fs.existsSync(path.join(r.dir, 'loading.tsx')))
            .map(r => r.rota);
        expect(sem, `rotas que deixam a tela anterior parada:\n${sem.join('\n')}`).toEqual([]);
    });

    it('BDD 1: a lista de exceções não cresceu sem alguém decidir', () => {
        expect(Object.keys(EXCECOES).sort()).toEqual(['/login']);
        const existentes = rotasComPagina().map(r => r.rota);
        for (const rota of Object.keys(EXCECOES)) {
            expect(existentes, `exceção obsoleta: ${rota}`).toContain(rota);
        }
    });

    it('BDD 1: o esqueleto tem conteúdo — arquivo vazio não é boundary', () => {
        // Um `loading.tsx` que devolve `null` satisfaz o Next e **não mostra nada**:
        // o boundary existe, a tela continua parada, e o teste acima passa. É a
        // forma mais fácil de esta task virar teatro.
        for (const { rota, dir } of rotasComPagina()) {
            const arquivo = path.join(dir, 'loading.tsx');
            if (!fs.existsSync(arquivo)) continue;
            const fonte = semComentarios(arquivo);
            expect(fonte.length, `${rota}: loading.tsx quase vazio`).toBeGreaterThan(120);
            expect(fonte, `${rota}: loading.tsx não devolve nada visível`).not.toMatch(/return\s+null\s*;/);
        }
    });
});

describe('TASK-096 — o menu navega com `<Link>`', () => {
    const sidebar = () => semComentarios(path.resolve(RAIZ, 'src/app/components/Sidebar.tsx'));

    it('BDD 2: as quatro superfícies de navegação usam `<Link>`', () => {
        // São quatro e é fácil converter três: menu lateral, os dois itens de conta,
        // e a BARRA INFERIOR DO MOBILE — que é justamente a mais usada na portaria.
        const fonte = sidebar();
        expect(fonte, 'o Sidebar não importa `Link`').toMatch(/from\s+['"]next\/link['"]/);
        expect(fonte, 'ainda há navegação por `router.push` no menu')
            .not.toMatch(/router\.push\(/);
    });

    it('BDD 2: o drawer do mobile continua fechando ao navegar', () => {
        // ⚠️ Guarda contra a regressão específica desta troca. O `navigate()` antigo
        // fazia DUAS coisas: `router.push` e `closeMobile()`. Trocar por `<Link>` só
        // resolve a primeira — e o menu ficaria aberto por cima da página nova, no
        // aparelho onde o menu ocupa a tela inteira.
        //
        // ⚠️ A PRIMEIRA VERSÃO DESTE CENÁRIO PASSOU PELO MOTIVO ERRADO: procurava
        // `onClick={...closeMobile}` em qualquer lugar do arquivo, e casava com o
        // OVERLAY do drawer (`<div className="sidebar-overlay" onClick={closeMobile}>`),
        // que sempre existiu. Dava verde com a navegação inteira sem fechar o menu.
        // Agora olha DENTRO de cada bloco de navegação, um de cada vez.
        const fonte = sidebar();
        const blocos: Record<string, string> = {
            'menu lateral': fonte.slice(fonte.indexOf('navItems.map('), fonte.indexOf('mobile-topbar')),
            'barra inferior do mobile': fonte.slice(fonte.indexOf('mobile-bottom-nav')),
        };
        for (const [nome, bloco] of Object.entries(blocos)) {
            expect(bloco.length, `bloco "${nome}" não foi encontrado no arquivo`).toBeGreaterThan(200);
            expect(bloco, `${nome}: navegar não fecha mais o drawer`).toMatch(/closeMobile/);
        }
    });
});
