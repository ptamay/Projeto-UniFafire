import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

// TASK-134 (ADR-031 · REQ-033b/c) — o Dashboard no celular, medido na tela.
//
// Critério do REQ-033: num aparelho de 360×640, a busca é o primeiro controle e a
// primeira chave aparece sem rolar; toda chave mostra a ação em palavra. Antes, título
// de duas linhas, subtítulo, contadores e a caixa da dupla confirmação empurravam a
// busca para ~40% da tela, e a chave disponível não mostrava ação nenhuma (tocar no
// cartão era "retirar", e nada dizia isso).

const VERBOS = /^(Pegar|Entregar|Devolver|Pedir|Cancelar)$/;

async function abrirNoCelularPequeno(page: Page, usuario: string) {
    await page.setViewportSize({ width: 360, height: 640 });
    await login(page, usuario);
    await page.locator('.plaqueta').first().waitFor();
}

test.describe('TASK-134 — Dashboard no celular: busca, filtros e plaquetas', () => {
    test.beforeEach(({}, info) => {
        test.skip(info.project.name !== 'mobile', 'critério do celular');
    });

    for (const usuario of ['e2e_aluno', 'e2e_porteiro']) {
        test(`${usuario}: a 360×640, a busca é o primeiro controle e a primeira chave aparece sem rolar`, async ({ page }) => {
            await abrirNoCelularPequeno(page, usuario);
            const medidas = await page.evaluate(() => {
                const main = document.querySelector('main.main-content')!;
                const visivel = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                const controles = [...main.querySelectorAll('input, select, textarea, button, a[href], [role="button"]')].filter(visivel);
                const topo = (el: Element) => el.getBoundingClientRect().top;
                const primeiro = controles.sort((a, b) => topo(a) - topo(b))[0];
                const barraInferior = document.querySelector('.mobile-bottom-nav')!.getBoundingClientRect().top;
                const plaqueta = main.querySelector('.plaqueta')!.getBoundingClientRect();
                return {
                    primeiro: primeiro ? (primeiro.getAttribute('aria-label') ?? primeiro.textContent?.trim()) : null,
                    primeiroEBusca: primeiro?.matches('input[type="search"], .dashboard-busca input') ?? false,
                    fundoDaPlaqueta: plaqueta.bottom,
                    barraInferior,
                };
            });
            expect(medidas.primeiroEBusca, `o primeiro controle é "${medidas.primeiro}", não a busca`).toBe(true);
            expect(medidas.fundoDaPlaqueta, 'a primeira chave não cabe acima da barra inferior').toBeLessThanOrEqual(medidas.barraInferior);
        });
    }

    test('a busca e os filtros ficam presos no topo ao rolar', async ({ page }) => {
        await abrirNoCelularPequeno(page, 'e2e_admin');
        const antes = await page.locator('.dashboard-busca input').boundingBox();
        await page.evaluate(() => window.scrollTo(0, 400));
        await page.waitForTimeout(100);
        const depois = await page.locator('.dashboard-busca input').boundingBox();
        const topbar = await page.locator('.mobile-topbar').boundingBox();
        expect(antes).toBeTruthy();
        expect(depois!.y, 'a busca rolou para fora da tela').toBeGreaterThanOrEqual(topbar!.y + topbar!.height - 1);
        expect(depois!.y, 'a busca não ficou presa logo abaixo da barra do topo').toBeLessThanOrEqual(topbar!.y + topbar!.height + 16);
        await expect(page.locator('.dashboard-filter-chip').first()).toBeInViewport();
    });

    test('os filtros são os contadores: cada um diz quantas chaves tem, e os contadores soltos saíram', async ({ page }) => {
        await abrirNoCelularPequeno(page, 'e2e_aluno');
        const textos = await page.locator('.dashboard-filter-chip').allTextContents();
        for (const t of textos) expect(t.trim(), `filtro sem contagem: "${t}"`).toMatch(/\d+$/);
        await expect(page.locator('.dashboard-stats')).toBeHidden();
    });

    for (const usuario of ['e2e_aluno', 'e2e_aluno2', 'e2e_porteiro']) {
        test(`${usuario}: toda chave mostra a ação em palavra, e só o verbo age — a linha não é um botão escondido`, async ({ page }) => {
            await abrirNoCelularPequeno(page, usuario);
            await page.locator('.dashboard-filter-chip', { hasText: /^Todas/ }).click();
            const linhas = await page.locator('.plaqueta').evaluateAll(els => els.map(el => ({
                nome: el.querySelector('.plaqueta-nome')?.textContent?.trim(),
                verbos: [...el.querySelectorAll('button')].map(b => b.textContent?.trim() ?? ''),
                aguardando: /Aguardando/.test(el.textContent ?? ''),
                papel: el.getAttribute('role'),
                focavel: el.hasAttribute('tabindex'),
            })));
            expect(linhas.length).toBeGreaterThan(0);
            for (const l of linhas) {
                // Pendente alheio não tem ação — e diz que está aguardando.
                if (l.verbos.length === 0) expect(l.aguardando, `"${l.nome}" sem verbo e sem estado`).toBe(true);
                else expect(l.verbos.some(v => VERBOS.test(v)), `"${l.nome}" sem verbo: ${l.verbos.join(', ')}`).toBe(true);
                expect(l.papel, `"${l.nome}" é um botão escondido`).not.toBe('button');
                expect(l.focavel, `"${l.nome}" recebe foco como se fosse botão`).toBe(false);
            }
            // O toque no NOME da chave não faz nada: quem age é o verbo. (O handler do React
            // não aparece no DOM — então se mede o efeito: nenhum diálogo abre.)
            await page.locator('.plaqueta .plaqueta-nome').first().click();
            await page.waitForTimeout(400);
            await expect(page.locator('.modal-overlay')).toHaveCount(0);
        });
    }

    test('a sala aparece inteira, sem reticências', async ({ page }) => {
        await abrirNoCelularPequeno(page, 'e2e_porteiro');
        const cortadas = await page.locator('.plaqueta-sala').evaluateAll(els =>
            els.filter(el => el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === 'ellipsis').map(el => el.textContent));
        expect(cortadas).toEqual([]);
    });
});
