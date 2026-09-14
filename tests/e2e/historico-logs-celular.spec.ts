import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

// TASK-135 (ADR-031 · REQ-033b/d) — Histórico e Logs no celular, medidos na tela.
//
// Critério do REQ-033: num aparelho de 360×640, no Histórico e nos Logs o primeiro
// registro aparece sem rolar; ação destrutiva nunca é o primeiro nem o maior botão.
// Antes: três botões de largura cheia (o primeiro, "Limpar Histórico", vermelho), duas
// métricas em jargão e seis filtros empilhados antes de qualquer registro.

async function abrir(page: Page, rota: string) {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(rota);
    await page.waitForLoadState('load');
    await page.locator('main.main-content .page-title').first().waitFor({ state: 'attached' });
}

test.describe('TASK-135 — Histórico e Logs no celular', () => {
    test.beforeEach(async ({ page }, info) => {
        test.skip(info.project.name !== 'mobile', 'critério do celular');
        await login(page, 'e2e_admin');
    });

    for (const rota of ['/history', '/logs']) {
        test(`${rota}: a 360×640, o primeiro registro aparece sem rolar, e a busca vem antes dos filtros`, async ({ page }) => {
            await abrir(page, rota);
            const medidas = await page.evaluate(() => {
                const main = document.querySelector('main.main-content')!;
                const registro = main.querySelector('.table-cards tbody tr')!.getBoundingClientRect();
                const barraInferior = document.querySelector('.mobile-bottom-nav')!.getBoundingClientRect().top;
                const visivel = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                const campos = [...main.querySelectorAll('input, select')].filter(visivel);
                return {
                    topoDoRegistro: registro.top,
                    barraInferior,
                    camposVisiveis: campos.map(c => (c as HTMLInputElement).type || c.tagName),
                };
            });
            expect(medidas.topoDoRegistro, 'o primeiro registro está abaixo da barra inferior').toBeLessThan(medidas.barraInferior - 40);
            // Com a folha fechada, o único campo à vista é a busca.
            expect(medidas.camposVisiveis).toEqual(['search']);
        });

        test(`${rota}: "Filtros" abre uma folha de baixo para cima, e a contagem aparece no botão`, async ({ page }) => {
            await abrir(page, rota);
            const botao = page.getByRole('button', { name: /^Filtros/ });
            await expect(botao).toBeVisible();
            await expect(page.locator('.folha-filtros')).not.toBeInViewport();
            await botao.click();
            const folha = page.locator('.folha-filtros');
            await expect(folha).toBeInViewport();
            const caixa = (await folha.boundingBox())!;
            const altura = page.viewportSize()!.height;
            expect(Math.round(caixa.y + caixa.height), 'a folha não encosta embaixo').toBeGreaterThanOrEqual(altura - 1);
            // Um filtro escolhido vira contagem no botão.
            await folha.locator('select').last().selectOption({ index: 1 });
            await page.getByRole('button', { name: 'Ver resultados' }).click();
            await expect(folha).not.toBeInViewport();
            await expect(page.getByRole('button', { name: /^Filtros \(1\)$/ })).toBeVisible();
        });

        test(`${rota}: as ações ficam num menu "⋯", sem rótulos em jargão`, async ({ page }) => {
            await abrir(page, rota);
            await page.getByRole('button', { name: 'Mais ações' }).click();
            await expect(page.getByRole('menuitem').first()).toBeVisible();
            const texto = await page.locator('main').innerText();
            expect(texto).not.toMatch(/Hora \(0-23\)|Data Específica|Portador|Dupla confirmação|Tempo de balcão/);
        });
    }

    test('/history: a busca filtra pelo nome da chave, sem acento nem maiúscula, e vai para a URL', async ({ page }) => {
        await abrir(page, '/history');
        await page.getByRole('searchbox', { name: 'Buscar por chave, sala ou pessoa' }).fill('pull');
        await expect(page).toHaveURL(/[?&]q=pull\b/);
        const linhas = page.locator('.table-cards tbody tr');
        await expect(linhas.first()).toBeVisible();
        const chaves = await linhas.locator('td[data-label="Chave"]').allTextContents();
        expect(chaves.length).toBeGreaterThan(0);
        for (const c of chaves) expect(c).toMatch(/Pull/);
    });

    test('o Histórico não tem mais "Limpar Histórico"; ele está na Zona de Perigo, e não é o primeiro botão da tela', async ({ page }) => {
        await abrir(page, '/history');
        await expect(page.getByRole('button', { name: /Limpar hist[óo]rico/i })).toHaveCount(0);
        await abrir(page, '/settings');
        const zona = page.locator('section[aria-labelledby="zona-perigo"]');
        await expect(zona.getByRole('button', { name: /Limpar hist[óo]rico/i })).toBeVisible();
        const primeiro = await page.locator('main .btn:visible').first().getAttribute('class');
        expect(primeiro, 'o primeiro botão da tela é destrutivo').not.toMatch(/btn-perigo/);
    });
});

test.describe('TASK-135 — no desktop, os filtros continuam na página', () => {
    test('Histórico: os filtros estão à vista sem abrir nada', async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'só desktop');
        await login(page, 'e2e_admin');
        await page.goto('/history');
        await expect(page.locator('.folha-filtros select').first()).toBeVisible();
        await expect(page.getByRole('button', { name: /^Filtros/ })).toBeHidden();
    });
});
