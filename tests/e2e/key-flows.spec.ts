import { test, expect } from '@playwright/test';
import { login, logout, expectNoHorizontalScroll } from './helpers';

// Fluxos críticos 2 e 3 (spec §4) com dupla confirmação (REQ-003/004),
// executados pela UI real em desktop E mobile (TASK-028).
// O ciclo completo devolve a chave a 'available' — estado restaurado para o
// próximo projeto de viewport.

test.describe('Ciclo de vida da chave — dupla confirmação', () => {
    test.beforeEach(async ({ page }) => {
        // Grid de cards no dashboard: mesmo caminho de UI nos dois viewports
        await page.addInitScript(() => localStorage.setItem('dashboard-view', 'grid'));
    });

    test('retirada (aluno solicita → porteiro confirma) e devolução (porteiro inicia → aluno confirma)', async ({ page }) => {
        // ── FLUXO 2: RETIRADA ─────────────────────────────────────────
        // Aluno solicita a chave para si mesmo no dashboard
        await login(page, 'e2e_aluno');
        await expectNoHorizontalScroll(page);

        const withdrawBtn = page.getByRole('button', { name: 'Solicitar Retirada' });
        await withdrawBtn.scrollIntoViewIfNeeded();
        await expect(withdrawBtn).toBeVisible();
        await withdrawBtn.click();

        // Modal de confirmação destrutiva/operacional
        await expect(page.getByText('Solicitar Retirada?')).toBeVisible();
        await page.getByRole('button', { name: 'Confirmar', exact: true }).click();

        // Aluno iniciou → já confirmou como usuário; aguarda o porteiro
        await page.goto('/confirm');
        await expect(page.getByText('Aguardando porteiro')).toBeVisible();
        await expectNoHorizontalScroll(page);

        // Porteiro confirma na Central de Confirmações
        await logout(page);
        await login(page, 'e2e_porteiro');
        await page.goto('/confirm');
        await expect(page.getByText('Chave E2E')).toBeVisible();
        await page.getByRole('button', { name: /Confirmar/ }).first().click();

        // Dupla confirmação completa → chave em uso
        await page.goto('/');
        const returnBtn = page.getByRole('button', { name: 'Solicitar Devolução' });
        await returnBtn.scrollIntoViewIfNeeded();
        await expect(returnBtn).toBeVisible();

        // ── FLUXO 3: DEVOLUÇÃO ────────────────────────────────────────
        // Porteiro inicia a devolução
        await returnBtn.click();
        await expect(page.getByText('Solicitar Devolução?')).toBeVisible();
        await page.getByRole('button', { name: 'Confirmar', exact: true }).click();

        // Aluno confirma a devolução no celular/desktop
        await logout(page);
        await login(page, 'e2e_aluno');
        await page.goto('/confirm');
        await expect(page.getByText('Chave E2E')).toBeVisible();
        const confirmBtn = page.getByRole('button', { name: /Confirmar/ }).first();
        // Alvo de toque ≥ 44px no botão do fluxo crítico (spec §6)
        const box = await confirmBtn.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await confirmBtn.click();

        // Chave volta a 'disponível' — ciclo completo, estado restaurado
        await page.goto('/');
        const withdrawAgain = page.getByRole('button', { name: 'Solicitar Retirada' });
        await withdrawAgain.scrollIntoViewIfNeeded();
        await expect(withdrawAgain).toBeVisible();
        await expectNoHorizontalScroll(page);
    });
});
