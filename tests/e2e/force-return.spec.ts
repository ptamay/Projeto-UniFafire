import { test, expect, Page } from '@playwright/test';
import { login, expectNoHorizontalScroll } from './helpers';

// REQ-028 (ADR-009) — devolução forçada ampla pela portaria pela UI real, em desktop E mobile.
// A portaria devolve à força uma chave em uso por um usuário comum (funcionário sem celular),
// informando justificativa, sem o portador confirmar. Ao final, re-atribui a chave para
// restaurar o estado (via API autenticada) para o próximo projeto de viewport.

const KEY = 'Chave Devolver E2E';

// Abre a devolução da chave: no mobile pelo botão "Devolver" do card, no desktop pela linha.
async function openReturn(page: Page, isMobile: boolean) {
    await expect(async () => {
        const container = isMobile
            ? page.locator('.key-card', { hasText: KEY })
            : page.locator('.dashboard-list-row', { hasText: KEY });
        await container.getByRole('button', { name: 'Devolver', exact: true }).click({ timeout: 3000 });
        await expect(page.getByText('Solicitar Devolução?')).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });
}

test.describe('Devolução forçada pela portaria (REQ-028)', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('dashboard-view', 'grid'));
    });

    test('porteiro força a devolução de chave em uso, com justificativa', async ({ page }, testInfo) => {
        const isMobile = testInfo.project.name === 'mobile';

        await login(page, 'e2e_porteiro');
        await expectNoHorizontalScroll(page);

        await openReturn(page, isMobile);

        // Marca "confirmar sem o portador" e informa a justificativa obrigatória
        await page.getByRole('checkbox').check();
        await page.getByRole('combobox').selectOption('Funcionário sem acesso a celular/internet');
        await page.getByRole('button', { name: 'Confirmar agora', exact: true }).click();

        // A chave volta a disponível — verificado no card/linha do viewport atual
        const container = isMobile
            ? page.locator('.key-card', { hasText: KEY })
            : page.locator('.dashboard-list-row', { hasText: KEY });
        await expect(container.getByText(/dispon[ií]vel/i)).toBeVisible();
        await expectNoHorizontalScroll(page);

        // Restaura o estado: re-atribui a chave ao Aluno E2E via API (bypass), para o próximo projeto
        const keys = await (await page.request.get('/api/keys')).json();
        const key = keys.find((k: { name: string; id: number }) => k.name === KEY);
        const users = await (await page.request.get('/api/users')).json();
        const aluno = users.find((u: { username: string; id: number }) => u.username === 'e2e_aluno');
        const restore = await page.request.post('/api/transactions', {
            data: { action: 'withdraw', key_id: key.id, user_id: aluno.id, bypassConfirmation: true, justification: 'Restauração do estado de teste' },
        });
        expect(restore.ok()).toBeTruthy();
    });
});
