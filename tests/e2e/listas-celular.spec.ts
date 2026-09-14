import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

// TASK-136 (ADR-031 · REQ-033c/d) — Chaves e Usuários no celular, medidos na tela.
// Cada item é uma linha (nome, apoio, estado) com "Editar" e "Remover" como ações
// secundárias; remover pede confirmação; nenhum botão vermelho cheio na lista.

async function abrir(page: Page, rota: string) {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(rota);
    await page.waitForLoadState('load');
    await page.locator('.lista-linhas .linha-lista').first().waitFor();
    // Mede com a fonte do sistema carregada: com a de reserva (mais larga, visto no CI em
    // `next dev`), as ações de Usuários quebravam em duas linhas e a linha passava de 160 px.
    await page.evaluate(() => document.fonts.ready);
}

test.describe('TASK-136 — listas no celular', () => {
    test.beforeEach(async ({ page }, info) => {
        test.skip(info.project.name !== 'mobile', 'critério do celular');
        await login(page, 'e2e_admin');
    });

    for (const rota of ['/keys', '/users']) {
        test(`${rota}: cada item é uma linha com nome e apoio, e a tabela de rótulos sumiu`, async ({ page }) => {
            await abrir(page, rota);
            await expect(page.locator('main table')).toBeHidden();
            const linhas = await page.locator('.linha-lista').evaluateAll(els => els.map(el => ({
                nome: el.querySelector('.linha-nome')?.textContent?.trim() ?? '',
                apoio: el.querySelector('.linha-apoio')?.textContent?.trim() ?? '',
                altura: el.getBoundingClientRect().height,
            })));
            expect(linhas.length).toBeGreaterThan(0);
            for (const l of linhas) {
                expect(l.nome, 'linha sem nome').not.toBe('');
                expect(l.apoio, `"${l.nome}" sem sala/papel`).not.toBe('');
                // Uma linha, não um cartão de quatro rótulos: cabe em menos de 1/4 da tela.
                expect(l.altura, `"${l.nome}" alta demais para uma linha`).toBeLessThan(160);
            }
        });

        test(`${rota}: "Remover" é secundário — nenhum botão vermelho cheio, e o primeiro botão não apaga`, async ({ page }) => {
            await abrir(page, rota);
            await expect(page.locator('main .btn-perigo:visible')).toHaveCount(0);
            const primeiro = await page.locator('main .btn:visible').first().textContent();
            expect(primeiro ?? '').not.toMatch(/Remover/);
            const remover = page.locator('.linha-lista').first().getByRole('button', { name: /Remover/ });
            await expect(remover).toBeVisible();
            await expect(remover).toHaveClass(/btn-remover/);
        });

        test(`${rota}: tocar em "Remover" pede confirmação, e cancelar não apaga nada`, async ({ page }) => {
            await abrir(page, rota);
            const antes = await page.locator('.linha-lista').count();
            // A primeira linha que o servidor aceitaria remover: em /keys, uma chave livre.
            const alvo = rota === '/keys'
                ? page.locator('.linha-lista', { hasText: /Livre/ }).first()
                : page.locator('.linha-lista', { hasText: /e2e_aluno2/ }).first();
            await alvo.getByRole('button', { name: /Remover/ }).click();
            const dialogo = page.locator('.modal-box');
            await expect(dialogo).toBeVisible();
            await expect(dialogo.locator('.btn-perigo')).toBeVisible();
            await dialogo.getByRole('button', { name: 'Cancelar' }).click();
            await expect(dialogo).toBeHidden();
            await expect(page.locator('.linha-lista')).toHaveCount(antes);
        });
    }

    test('/users: os filtros por papel são botões com estado, e filtram a lista', async ({ page }) => {
        await abrir(page, '/users');
        const aluno = page.locator('.filtro-papel', { hasText: /^Aluno/ });
        await expect(aluno).toHaveAttribute('aria-pressed', 'false');
        await aluno.click();
        await expect(aluno).toHaveAttribute('aria-pressed', 'true');
        const apoios = await page.locator('.linha-lista .linha-apoio').allTextContents();
        expect(apoios.length).toBeGreaterThan(0);
        for (const a of apoios) expect(a).toMatch(/Aluno/);
    });
});
