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

const semComentarios = (arquivo: string) =>
    fs.readFileSync(arquivo, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ⚠️ O bloco "toda rota mostra que está carregando" (BDD 1: `loading.tsx` obrigatório) SAIU
// na TASK-128 (ADR-029). O esqueleto resolveu a tela parada ao preço de um corte seco a cada
// troca — relato do usuário em 2026-09-14. Agora a tela atual espera e o link clicado
// sinaliza; a guarda é o OPOSTO (nenhuma `loading.tsx`), em `tests/troca-de-tela-suave.test.ts`.
// O BDD 2 abaixo continua valendo inteiro.

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

    it('BDD 2: os links do menu NÃO fazem prefetch — e isso foi medido', () => {
        // ⚠️ ESTE CENÁRIO CONTRARIA A PRESCRIÇÃO ORIGINAL DO ADR-018, que pedia
        // "`<Link>` com prefetch". O ADR também mandava OBSERVAR as requisições — e a
        // observação mudou a decisão. Medido num build de produção local:
        //
        //                          com prefetch      sem prefetch
        //   requisições no load         13                 0
        //   por `router.refresh()`       7                 1
        //   esqueleto aparece em     29–43 ms           3–14 ms
        //
        // O prefetch não compra nada aqui: o esqueleto vem do BUNDLE DA ROTA, não do
        // payload prefetchado. Quem faz a transição parecer imediata é o
        // `loading.tsx`, e ele funciona igual com prefetch desligado.
        //
        // E o custo não é por página: `router.refresh()` invalida o cache do
        // roteador e TODOS os links prefetcham de novo. Ele é chamado pelo
        // `refreshData` a cada sinal do Realtime — ou seja, a cada operação de
        // chave, em cada cliente aberto. É um multiplicador ligado à ATIVIDADE, que
        // é a forma exata do problema que criou o REQ-032 (polling de 3 s projetando
        // ~10,5 mi de requisições/mês).
        //
        // Sem esta guarda, alguém lê o ADR, vê `prefetch={false}` e "corrige".
        const fonte = sidebar();
        const ocorrencias = (fonte.match(/prefetch=\{false\}/g) ?? []).length;
        expect(ocorrencias, 'algum link de navegação voltou a fazer prefetch')
            .toBeGreaterThanOrEqual(2);
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
