import { Page, expect } from '@playwright/test';

export const E2E_PASSWORD = 'e2e_password_123';

export async function login(page: Page, username: string) {
    // networkidle: garante a hidratação do React antes de interagir —
    // sem isso o form faz submit nativo (GET /login?) em dev mode.
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.fill('#username', username);
    await page.fill('#password', E2E_PASSWORD);
    await page.click('#btn-login');
    await expect(page).toHaveURL('/');
}

export async function logout(page: Page) {
    await page.request.post('/api/auth/logout');
}

/** REQ-016: nenhuma tela pode gerar scroll horizontal (viewport ≥ 360px). */
export async function expectNoHorizontalScroll(page: Page) {
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, 'página não pode ter scroll horizontal').toBeLessThanOrEqual(1);
}
