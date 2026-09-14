import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

// TASK-128 (CR Tipo C · ADR-029) — a troca de tela sem corte seco.
//
// O relato: a cada troca de tela o conteúdo virava blocos cinzas de uma vez e depois a página
// de uma vez. Agora a tela atual fica até a próxima estar pronta, o link clicado sinaliza a
// espera (item marcado + barra no topo) e a tela nova entra com um fade.
//
// ## Como a prova não depende de sorte
//
// A resposta da navegação (`?_rsc=`) é SEGURADA por 1,5 s, como uma função fria em produção.
// Um laço de `requestAnimationFrame` instalado antes do clique anota CADA quadro até a tela
// nova chegar: se havia `main.main-content` no documento, se havia esqueleto, qual título
// estava na tela, se a barra e a marca do item existiam. Nada disso é amostrado num instante
// escolhido — são todos os quadros.
//
// Medido pela sessão da TASK-130 no build de produção ANTES desta task: entre as irmãs
// `/account/profile` → `/account/security`, ~400 ms (≈25 quadros) SEM NENHUM `main` — conteúdo
// em branco ao lado do menu. Por isso esse percurso está aqui, e a exigência é zero quadros.

const ATRASO_MS = 1500;

type Quadro = { t: number; caminho: string; temMain: boolean; esqueleto: boolean; titulo: string; barra: boolean; pendente: boolean };

async function segurarNavegacao(page: Page) {
    await page.route(/_rsc=/, async (route) => {
        await new Promise(r => setTimeout(r, ATRASO_MS));
        await route.continue();
    });
}

async function gravarQuadros(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __quadros: Quadro[]; __gravando: boolean; __entradas: number };
        w.__quadros = [];
        w.__gravando = true;
        w.__entradas = 0;
        document.addEventListener('animationstart', (e) => {
            if ((e as AnimationEvent).animationName === 'entrar-tela') w.__entradas++;
        }, true);
        const t0 = performance.now();
        const passo = () => {
            if (!w.__gravando) return;
            const main = document.querySelector('main.main-content');
            w.__quadros.push({
                t: Math.round(performance.now() - t0),
                caminho: location.pathname,
                temMain: !!main,
                esqueleto: !!document.querySelector('main[aria-busy="true"]'),
                titulo: main?.querySelector('.page-title')?.textContent?.trim() ?? '',
                barra: !!document.querySelector('.barra-navegacao'),
                pendente: !!document.querySelector('.nav-pendente'),
            });
            requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
    });
}

async function pararGravacao(page: Page) {
    return page.evaluate(() => {
        const w = window as unknown as { __quadros: Quadro[]; __gravando: boolean; __entradas: number };
        w.__gravando = false;
        return { quadros: w.__quadros, entradas: w.__entradas };
    });
}

/** Clica no link, espera a tela nova, e devolve os quadros da espera. O título é o `.page-title`
 *  (seis telas o põem num h1, três num h2). */
async function trocarDeTela(page: Page, link: string, destino: string) {
    await page.locator('main.main-content .page-title').first().waitFor();
    const tituloAntes = (await page.locator('main.main-content .page-title').first().textContent())?.trim() ?? '';
    await gravarQuadros(page);
    await page.locator(link).first().click();
    await page.waitForURL((u) => new URL(u).pathname === destino);
    await expect(page.locator('.barra-navegacao')).toHaveCount(0);
    await page.waitForTimeout(400); // a animação de entrada (200 ms) termina
    const r = await pararGravacao(page);
    const espera = r.quadros.filter(q => q.caminho !== destino);
    return { tituloAntes, ...r, espera };
}

function conferir(nome: string, r: Awaited<ReturnType<typeof trocarDeTela>>) {
    const semMain = r.quadros.filter(q => !q.temMain);
    const comEsqueleto = r.quadros.filter(q => q.esqueleto);
    expect(r.espera.length, `${nome}: nenhum quadro de espera — o atraso não segurou nada e a prova não viu nada`).toBeGreaterThan(20);
    expect(semMain.length, `${nome}: ${semMain.length} quadros SEM conteúdo (em branco), a partir de ${JSON.stringify(semMain[0])}`).toBe(0);
    expect(comEsqueleto.length, `${nome}: o esqueleto apareceu em ${comEsqueleto.length} quadros`).toBe(0);
    const trocouCedo = r.espera.filter(q => q.titulo !== r.tituloAntes);
    expect(trocouCedo.length, `${nome}: durante a espera o título deixou de ser "${r.tituloAntes}" (${JSON.stringify(trocouCedo[0])})`).toBe(0);
    expect(r.espera.some(q => q.pendente), `${nome}: o item clicado nunca foi marcado`).toBe(true);
    expect(r.espera.some(q => q.barra), `${nome}: a barra do topo nunca apareceu numa espera de ${ATRASO_MS} ms`).toBe(true);
}

test.describe('TASK-128 — a troca de tela não tem corte seco (ADR-029)', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, 'e2e_admin');
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    });

    test('pelo menu: a tela atual fica, o item e a barra sinalizam, a nova entra com fade', async ({ page }, testInfo) => {
        const celular = testInfo.project.name === 'mobile';
        const nav = celular ? '.mobile-bottom-nav' : 'aside.sidebar';
        await segurarNavegacao(page);

        for (const destino of ['/confirm', '/keys', '/']) {
            const r = await trocarDeTela(page, `${nav} a[href="${destino}"]`, destino);
            conferir(destino, r);
            expect(r.entradas, `${destino}: a tela nova não rodou a animação de entrada`).toBeGreaterThanOrEqual(1);
        }
    });

    test('entre telas irmãs (Perfil → Segurança): nenhum quadro em branco', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name === 'mobile', 'no celular o menu da conta fica na gaveta; o percurso do menu já cobre o celular');
        await page.goto('/account/profile');
        await segurarNavegacao(page);
        await page.locator('.user-profile-compact').click();
        const r = await trocarDeTela(page, 'aside.sidebar a[href="/account/security"]', '/account/security');
        conferir('/account/security', r);
    });

    test('com movimento reduzido, a troca é direta: sem fade', async ({ page }) => {
        const animacao = () => page.locator('main.main-content').first().evaluate(el => getComputedStyle(el).animationName);
        // Primeiro SEM a preferência: a entrada existe. Sem este passo o cenário passaria numa
        // tela que simplesmente não anima nada — e passava, na `main` de antes desta task.
        await page.goto('/');
        expect(await animacao()).toBe('entrar-tela');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('/');
        expect(await animacao()).toBe('none');
    });
});

// TASK-131 (emenda do ADR-029) — Confirmações, Logs e Usuários chegam COM os dados.
//
// Depois da TASK-128 a navegação ficou suave, mas estas três telas abriam vazias e buscavam os
// dados no navegador: cartões cinzas, spinner ou "Carregando…" — a tela chegava suave e piscava
// por dentro. As rotas de API delas ficam SEGURADAS aqui por 1,5 s: se a tela ainda dependesse
// delas para abrir, o estado de carregamento estaria na tela durante todo esse tempo.
test.describe('TASK-131 — as telas chegam com os dados, sem piscar por dentro', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, 'e2e_admin');
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    });

    test('Confirmações, Logs e Usuários: nenhum quadro com cinza, spinner ou "Carregando"', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name === 'mobile', 'Logs e Usuários ficam na gaveta do celular; o que se prova é a página, não o menu');
        await page.route(/\/api\/(transactions\/pending|logs|users)(\?|$)/, async (route) => {
            await new Promise(r => setTimeout(r, ATRASO_MS));
            await route.continue();
        });

        for (const destino of ['/confirm', '/logs', '/users']) {
            await page.locator(`aside.sidebar a[href="${destino}"]`).first().click();
            await page.waitForURL((u) => new URL(u).pathname === destino);
            const quadros = await page.evaluate(async () => {
                const out: { cinza: boolean; carregando: boolean }[] = [];
                const t0 = performance.now();
                await new Promise<void>(fim => {
                    const passo = () => {
                        const main = document.querySelector('main.main-content');
                        out.push({
                            cinza: !!main?.querySelector('.skeleton, .spinner'),
                            carregando: /Carregando/i.test(main?.textContent ?? ''),
                        });
                        if (performance.now() - t0 < 1600) requestAnimationFrame(passo); else fim();
                    };
                    requestAnimationFrame(passo);
                });
                return out;
            });
            expect(quadros.length, `${destino}: a gravação não viu quadros`).toBeGreaterThan(30);
            expect(quadros.filter(q => q.cinza).length, `${destino}: cinza/spinner na tela nova`).toBe(0);
            expect(quadros.filter(q => q.carregando).length, `${destino}: "Carregando" na tela nova`).toBe(0);
        }

        // E o conteúdo está lá — a prova não passa numa tela que simplesmente não mostra nada.
        await expect(page.locator('main.main-content tbody tr').first()).toBeVisible();   // Usuários
        await page.locator('aside.sidebar a[href="/logs"]').first().click();
        await page.waitForURL((u) => new URL(u).pathname === '/logs');
        await expect(page.locator('main.main-content tbody tr').first()).toBeVisible();   // Logs (os logins da suíte)
    });
});
