import { test, expect, Page } from '@playwright/test';
import { login, logout, expectNoHorizontalScroll } from './helpers';

// REQ-027 (ADR-008) — fluxo "pull": quem não está com a chave a solicita ao portador,
// que aceita em /confirm. Exercitado pela UI real em desktop E mobile (Playwright roda
// cada spec nos dois viewports — cobre a TASK-045).
// A chave 'Chave Pull E2E' é seedada em uso pelo Aluno E2E. O teste faz um round-trip
// (B pede de A, depois A pede de volta de B) — testa os dois sentidos e restaura o estado
// para o próximo projeto de viewport.

const PULL_KEY = 'Chave Pull E2E';

// Abre o modal de solicitação e envia. No mobile via botão do card, no desktop via botão da linha.
// Clique com retry até o modal abrir (o botão existe no SSR antes de a hidratação anexar o onClick).
async function requestKey(page: Page, isMobile: boolean) {
    await expect(async () => {
        const container = isMobile
            ? page.locator('.key-card', { hasText: PULL_KEY })
            : page.locator('.dashboard-list-row', { hasText: PULL_KEY });
        await container.getByRole('button', { name: 'Solicitar', exact: true }).click({ timeout: 3000 });
        await expect(page.getByText('Solicitar esta Chave?')).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Enviar solicitação', exact: true }).click();
}

// O portador aceita a solicitação na Central de Confirmações.
async function acceptRequest(page: Page) {
    await page.goto('/confirm');
    await expect(page.getByText('solicitou esta chave')).toBeVisible();
    await page.getByRole('button', { name: /Aceitar/ }).first().click();
    await expect(page.getByText('Nenhuma confirmação pendente no momento.')).toBeVisible();
}

// Confirma quem é o portador exibido no Dashboard para a chave do fluxo pull.
async function expectHolder(page: Page, isMobile: boolean, holderName: string) {
    await page.goto('/');
    const container = isMobile
        ? page.locator('.key-card', { hasText: PULL_KEY })
        : page.locator('.dashboard-list-row', { hasText: PULL_KEY });
    await expect(container.getByText(holderName)).toBeVisible();
}

test.describe('Solicitação de chave em uso — fluxo pull (REQ-027)', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('dashboard-view', 'grid'));
    });

    test('B solicita a chave de A, A aceita, e o sentido inverso restaura o estado', async ({ page }, testInfo) => {
        const isMobile = testInfo.project.name === 'mobile';

        // ── Sentido 1: Aluno Dois (B) solicita a chave que está com Aluno E2E (A) ──
        await login(page, 'e2e_aluno2');
        await expectNoHorizontalScroll(page);
        await requestKey(page, isMobile);

        // A aceita na Central de Confirmações
        await logout(page);
        await login(page, 'e2e_aluno');
        await acceptRequest(page);

        // A chave agora está com B
        await expectHolder(page, isMobile, 'Aluno Dois E2E');

        // ── Sentido 2 (restauração): A solicita a chave de volta de B, B aceita ──
        await requestKey(page, isMobile);
        await logout(page);
        await login(page, 'e2e_aluno2');
        await acceptRequest(page);

        // Estado restaurado: a chave volta ao Aluno E2E (A)
        await expectHolder(page, isMobile, 'Aluno E2E');
        await expectNoHorizontalScroll(page);
    });
});
