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

/**
 * REQ-016: nenhuma tela pode gerar scroll horizontal nem cortar conteúdo (viewport ≥ 360px).
 *
 * TASK-118 — medir só `documentElement.scrollWidth` é CEGO no celular: com
 * `html, body { overflow-x: hidden }` o `html` passa o overflow para a viewport, o
 * `body` vira container de rolagem próprio e segura a sobra — o documento nunca fica
 * mais largo que a tela, mesmo com o conteúdo cortado. Medido no Dashboard de ALUNO a
 * 375 px, antes da TASK-117: documento 375, `body` 462, `.main-content` 462.
 *
 * Por isso a largura do conteúdo é a MAIOR entre o documento, o `body` e a borda
 * direita do `.main-content`. Rolagem interna de um componente (a barra de filtros)
 * não entra: ela fica contida no próprio componente.
 */
export async function expectNoHorizontalScroll(page: Page) {
    const m = await page.evaluate(() => {
        const main = document.querySelector('.main-content') ?? document.querySelector('main');
        return {
            tela: document.documentElement.clientWidth,
            documento: document.documentElement.scrollWidth,
            corpo: document.body.scrollWidth,
            main: main ? Math.round(main.getBoundingClientRect().right) : 0,
        };
    });
    const excesso = Math.max(m.documento, m.corpo, m.main) - m.tela;
    expect(excesso, `conteúdo passa da tela: ${JSON.stringify(m)}`).toBeLessThanOrEqual(1);
}
