import { test, expect } from '@playwright/test';
import { login, expectNoHorizontalScroll } from './helpers';

// Fluxo crítico 1 (spec §4): login → dashboard — desktop e mobile (TASK-028).
test.describe('Autenticação', () => {
    test('login redireciona ao dashboard com navegação acessível', async ({ page, isMobile }) => {
        await login(page, 'e2e_admin');

        if (isMobile) {
            // REQ-016: shell mobile — topbar visível e menu abre a navegação.
            // Retry via toPass: o clique só surte efeito após a hidratação do React.
            await expect(page.locator('.mobile-topbar')).toBeVisible();
            await expect(async () => {
                await page.click('#mobile-menu-btn');
                await expect(page.locator('.sidebar.open .sidebar-nav')).toBeVisible({ timeout: 1000 });
            }).toPass({ timeout: 20_000 });
            await expect(page.locator('.sidebar.open').getByText('Administração')).toBeVisible();
        } else {
            await expect(page.locator('.sidebar-nav')).toBeVisible();
            await expect(page.getByText('Administração')).toBeVisible();
        }

        await expectNoHorizontalScroll(page);
    });

    test('login em viewport atual não exige zoom nem corta o formulário', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('#username')).toBeVisible();
        await expect(page.locator('#btn-login')).toBeVisible();
        // Alvo de toque ≥ 44px no botão de entrar (spec §6)
        const box = await page.locator('#btn-login').boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await expectNoHorizontalScroll(page);
    });
});
