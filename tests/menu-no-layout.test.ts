import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { listarPaginas, APP } from './rotas-de-pagina';

// TASK-125 (CR Tipo C · ADR-027) — o menu sai das páginas e vai para um layout compartilhado.
//
// ## O defeito, relatado pelo usuário com captura (2026-09-14)
//
// Ao trocar de tela, o menu lateral some e só o esqueleto aparece. Cada uma das nove telas
// desenhava o PRÓPRIO `<Sidebar>`, e o `loading.tsx` (TASK-096) troca o segmento da página
// inteiro — o menu ia junto. De lado: a cada navegação o menu remontava, e com ele a
// assinatura do sinal, o timer do logout automático e o tutorial.
//
// ## O que esta guarda cobra
//
// A ESTRUTURA que torna o defeito impossível: um único lugar desenha o menu, e esse lugar é um
// layout, que o App Router não troca na navegação. O comportamento (o elemento não desmonta, e
// está na tela durante o esqueleto) é provado pela E2E `tests/e2e/menu-no-layout.spec.ts`.
//
// E a fronteira de segurança, que é o risco desta mudança: o layout lê a sessão para desenhar
// o menu, e seria tentador mover a autorização para lá. Layout NÃO roda de novo na navegação
// pelo cliente — checagem só nele não protegeria a página seguinte (§3.2, TASK-090).

const RAIZ = process.cwd();
const LAYOUT = path.join(APP, '(app)', 'layout.tsx');

const semComentarios = (arquivo: string) =>
    fs.readFileSync(arquivo, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

function arquivosTsx(dir: string): string[] {
    const saida: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory() && e.name !== 'api') saida.push(...arquivosTsx(p));
        else if (e.name.endsWith('.tsx')) saida.push(p);
    }
    return saida;
}

const rel = (p: string) => path.relative(RAIZ, p).split(path.sep).join('/');

describe('TASK-125 — um lugar só desenha o menu, e é um layout', () => {
    it('BDD 1: existe o layout do grupo `(app)`, e é Server Component', () => {
        expect(fs.existsSync(LAYOUT), 'src/app/(app)/layout.tsx ausente').toBe(true);
        expect(fs.readFileSync(LAYOUT, 'utf-8'), 'o layout virou client component')
            .not.toMatch(/^\s*['"]use client['"]/m);
    });

    it('BDD 1: o layout desenha a moldura e o menu — fora da impressão', () => {
        const fonte = semComentarios(LAYOUT);
        expect(fonte).toMatch(/className="page-wrapper"/);
        expect(fonte, 'o menu precisa ficar dentro de .no-print (a impressão do Histórico)')
            .toMatch(/className="no-print"[^>]*>\s*(\{[^}]*&&\s*\(?\s*)?<Sidebar\b/);
        expect(fonte).toMatch(/\{children\}/);
    });

    it('BDD 1: NENHUM outro arquivo desenha `<Sidebar` — só o layout', () => {
        const desenham = arquivosTsx(APP)
            .filter(p => p !== LAYOUT && !p.endsWith(path.join('components', 'Sidebar.tsx')))
            .filter(p => /<Sidebar\b/.test(semComentarios(p)))
            .map(rel);
        expect(desenham, `ainda desenham o próprio menu:\n${desenham.join('\n')}`).toEqual([]);
    });

    it('BDD 1: nenhuma tela desenha a própria moldura — o `page-wrapper` é do layout', () => {
        const molduras = arquivosTsx(APP)
            .filter(p => p !== LAYOUT)
            .filter(p => /className="(page-wrapper|layout-container)"/.test(semComentarios(p)))
            .map(rel);
        expect(molduras, `ainda desenham a moldura:\n${molduras.join('\n')}`).toEqual([]);
    });

    it('BDD 2: toda página autenticada mora no grupo; o /login fica fora, sem menu', () => {
        const paginas = listarPaginas();
        const foraDoGrupo = paginas
            .filter(p => p.rota !== '/login')
            .filter(p => !p.arquivo.includes(`${path.sep}(app)${path.sep}`))
            .map(p => p.rota);
        expect(foraDoGrupo, `páginas autenticadas fora do layout do menu: ${foraDoGrupo.join(', ')}`).toEqual([]);

        const login = paginas.find(p => p.rota === '/login');
        expect(login, 'o /login sumiu').toBeDefined();
        expect(login!.arquivo, 'o /login entrou no grupo e ganharia o menu').not.toContain(`${path.sep}(app)${path.sep}`);
    });

    it('BDD 2: as URLs não mudam — as nove rotas continuam servidas', () => {
        const rotas = listarPaginas().map(p => p.rota).sort();
        expect(rotas).toEqual([
            '/', '/account/profile', '/account/security', '/confirm', '/history',
            '/keys', '/login', '/logs', '/settings', '/users',
        ]);
    });
});

describe('TASK-125 — a autorização NÃO sobe para o layout (§3.2)', () => {
    it('BDD 3: o layout não redireciona nem decide por papel — só desenha', () => {
        const fonte = semComentarios(LAYOUT);
        expect(fonte, 'o layout redireciona: a autorização subiu para ele').not.toMatch(/\bredirect\s*\(/);
        expect(fonte, 'o layout compara papel: a autorização subiu para ele')
            .not.toMatch(/\.role\s*(===|!==|==|!=)|\.includes\(\s*\w*\.role|\bnotFound\s*\(/);
    });

    it('BDD 3: o layout lê a sessão SEM ir ao banco — a checagem estrita é da página', () => {
        // O menu só precisa de papel e nome, que estão no JWT. `verifySession` consulta o
        // banco (a senha mudou? a conta foi desativada?); chamá-lo no layout dobraria a
        // consulta a cada renderização completa — e o `router.refresh()` do Dashboard roda a
        // cada sinal do Realtime. Quem recusa a sessão velha é a página, que redireciona.
        const fonte = semComentarios(LAYOUT);
        expect(fonte).toMatch(/verifySessionEdge/);
        expect(fonte).not.toMatch(/\bverifySession\s*\(/);
        expect(fonte).not.toMatch(/@\/lib\/pg/);
    });

    it('BDD 3: toda página do grupo continua verificando a sessão por conta própria', () => {
        const sem = listarPaginas()
            .filter(p => p.rota !== '/login')
            .filter(p => !/\bverifySession\s*\(/.test(semComentarios(p.arquivo)))
            .map(p => p.rota);
        expect(sem, `páginas que confiam no layout para autenticar: ${sem.join(', ')}`).toEqual([]);
    });
});

describe('TASK-125 — o estado morto sai', () => {
    it('BDD 4: o menu não recebe mais `isOpen`/`onMobileClose` — a gaveta é dele desde a TASK-111', () => {
        const sidebar = semComentarios(path.join(APP, 'components', 'Sidebar.tsx'));
        expect(sidebar).not.toMatch(/\bisOpen\b/);
        expect(sidebar).not.toMatch(/\bonMobileClose\b/);
        const comEstadoMorto = arquivosTsx(APP)
            .filter(p => /\bset(Is)?SidebarOpen\b/.test(semComentarios(p)))
            .map(rel);
        expect(comEstadoMorto, `ainda guardam estado da gaveta que ninguém abre:\n${comEstadoMorto.join('\n')}`).toEqual([]);
    });
});
