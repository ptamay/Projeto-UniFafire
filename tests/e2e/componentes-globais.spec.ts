import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

// TASK-133 (ADR-031 · REQ-033) — os componentes globais medidos na tela de verdade.
//
// A guarda estática (tests/componentes-quadro.test.ts) confere o CSS; esta confere o que
// o navegador calcula depois da cascata: um .btn do celular pode declarar 48 px e sair
// com 44 porque uma regra de toque vem depois. Quatro telas do ADMIN, desktop e celular.

const TELAS = ['/', '/keys', '/history', '/logs'];

async function abrir(page: Page, rota: string) {
    await page.goto(rota);
    await page.waitForLoadState('load');
    await page.locator('main.main-content .page-title').first().waitFor({ state: 'attached' });
}

test.describe('TASK-133 — componentes globais do quadro de chaves', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, 'e2e_admin');
    });

    for (const rota of TELAS) {
        test(`${rota}: botões com 40–48 px, o principal com 48`, async ({ page }, info) => {
            await abrir(page, rota);
            const celular = info.project.name === 'mobile';
            const alturas = await page.locator('main .btn:visible').evaluateAll(els => els.map(el => ({
                texto: (el.textContent ?? '').trim().slice(0, 30),
                classe: el.className,
                altura: Math.round(el.getBoundingClientRect().height * 10) / 10,
            })));
            expect(alturas.length, 'nenhum botão visível — a medição não viu nada').toBeGreaterThan(0);
            const minimo = celular ? 44 : 40;
            const fora = alturas.filter(b => b.altura < minimo - 0.5 || b.altura > 48.5);
            expect(fora, `botões fora de ${minimo}–48 px`).toEqual([]);
            // O principal da tela tem 48 px. `btn-sm` é o compacto de linha (o verbo ao lado de
            // cada chave) e o chip de filtro ativo não é ação — os dois ficam na altura secundária.
            const principais = alturas.filter(b => /\bbtn-principal\b/.test(b.classe) && !/\bbtn-sm\b|dashboard-filter-chip/.test(b.classe));
            if (rota === '/keys') expect(principais.length, 'o "Nova chave" deveria ser o principal da tela').toBeGreaterThan(0);
            for (const p of principais) expect(p.altura, `principal "${p.texto}"`).toBeGreaterThanOrEqual(47.5);
        });

        test(`${rota}: nada em repouso tem sombra, e nenhum texto é forçado em maiúsculas`, async ({ page }) => {
            await abrir(page, rota);
            const achados = await page.evaluate(() => {
                const fora: string[] = [];
                const REPOUSO = '.card, .btn, .status-tag, .stat-chip, .badge, .table-cards tr, .dashboard-list-row, '
                    + '.mobile-topbar, .mobile-bottom-nav, .unified-control-bar, .pending-inline, .key-card';
                for (const el of document.querySelectorAll<HTMLElement>(REPOUSO)) {
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) continue;
                    const s = getComputedStyle(el).boxShadow;
                    if (s !== 'none') fora.push(`sombra em ${el.className}: ${s}`);
                }
                for (const el of document.querySelectorAll<HTMLElement>('body *')) {
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0 || !el.textContent?.trim()) continue;
                    if (getComputedStyle(el).textTransform === 'uppercase') fora.push(`maiúsculas em <${el.tagName.toLowerCase()} class="${el.className}">`);
                    // Ponto cego achado na verificação: "EM USO" e "ALUNO" vinham ESCRITOS em
                    // maiúsculas no código — sem text-transform nenhum. Siglas curtas passam, e o
                    // código da ação nos Logs (.codigo-trilha: LOGOUT, LOGIN_SUCCESS) também — é o
                    // registro gravado, não rótulo.
                    if (el.children.length === 0 && !el.closest('.codigo-trilha')) {
                        const texto = el.textContent.trim();
                        const letras = texto.replace(/[^A-Za-zÀ-ÿ]/g, '');
                        if (letras.length >= 4 && texto === texto.toUpperCase() && !/^(PDF|CSV)$/.test(texto)) {
                            fora.push(`texto em maiúsculas: "${texto}"`);
                        }
                    }
                }
                return fora;
            });
            expect(achados).toEqual([]);
        });

        test(`${rota}: a página tem um h1, e no celular ele não repete a barra do topo`, async ({ page }, info) => {
            await abrir(page, rota);
            const h1 = page.locator('main h1.page-title');
            await expect(h1).toHaveCount(1);
            const caixa = await h1.evaluate(el => el.getBoundingClientRect());
            if (info.project.name === 'mobile') {
                expect(caixa.width * caixa.height, 'o título ainda ocupa espaço no celular').toBeLessThanOrEqual(1);
            } else {
                expect(caixa.height, 'o título sumiu do desktop').toBeGreaterThan(20);
            }
        });
    }

    test('celular: o "?" e o tema ficam juntos, na borda direita da barra do topo', async ({ page }, info) => {
        test.skip(info.project.name !== 'mobile', 'barra do topo só existe no celular');
        await abrir(page, '/');
        const largura = page.viewportSize()!.width;
        const ajuda = await page.getByRole('button', { name: 'Abrir tutorial (ajuda)' }).boundingBox();
        const tema = await page.locator('.mobile-topbar').getByRole('button', { name: /Ativar modo/ }).boundingBox();
        expect(ajuda && tema).toBeTruthy();
        expect(largura - (tema!.x + tema!.width), 'o tema não está na borda direita').toBeLessThanOrEqual(16);
        expect(tema!.x - (ajuda!.x + ajuda!.width), 'o "?" está longe do tema').toBeLessThanOrEqual(8);
        expect(Math.abs(tema!.y - ajuda!.y)).toBeLessThanOrEqual(1);
    });

    test('celular: o cartão que embrulhava Chaves, Histórico e Logs fica plano', async ({ page }, info) => {
        test.skip(info.project.name !== 'mobile', 'no desktop o cartão da página continua');
        for (const rota of ['/keys', '/history', '/logs']) {
            await abrir(page, rota);
            const estilo = await page.locator('main.main-content > .card').first().evaluate(el => {
                const s = getComputedStyle(el);
                return { fundo: s.backgroundColor, borda: s.borderTopWidth, padding: s.paddingLeft };
            });
            expect(estilo, rota).toEqual({ fundo: 'rgba(0, 0, 0, 0)', borda: '0px', padding: '0px' });
        }
    });
});
