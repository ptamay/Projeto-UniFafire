import { test, expect, Page } from '@playwright/test';
import { login, logout, expectNoHorizontalScroll } from './helpers';

// Fluxos críticos 2 e 3 (spec §4) com dupla confirmação (REQ-003/004),
// executados pela UI real em desktop E mobile (TASK-028).
// Desktop usa o modo lista (botões por linha); mobile usa o grid de cards,
// onde o toque no card abre o modal — mesmo caminho do usuário real em cada viewport.
// A devolução é iniciada pelo PORTADOR (aluno), cobrindo a visibilidade das ações
// do portador via keys.user_id (regressão corrigida no quick-fix pós-Sprint 11).
// O ciclo completo devolve a chave a 'available' — estado restaurado para o
// próximo projeto de viewport.

const KEY_NAME = 'Chave E2E';

// Abre o modal de retirada/devolução da chave: no mobile tocando no card,
// no desktop pelo botão da linha ('Solicitar' ou 'Devolver').
// Clique com retry até o modal abrir — o botão existe no HTML do SSR antes de a
// hidratação do React anexar o onClick, então o primeiro clique pode ser inerte.
async function openKeyAction(page: Page, isMobile: boolean, buttonName: 'Solicitar' | 'Devolver', modalTitle: string) {
    await expect(async () => {
        if (isMobile) {
            await page.locator('.key-card', { hasText: KEY_NAME }).locator('.key-card-title').click({ timeout: 3000 });
        } else {
            const row = page.locator('.dashboard-list-row', { hasText: KEY_NAME });
            await row.getByRole('button', { name: buttonName, exact: true }).click({ timeout: 3000 });
        }
        await expect(page.getByText(modalTitle)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });
}

test.describe('Ciclo de vida da chave — dupla confirmação', () => {
    test('retirada (aluno solicita → porteiro confirma) e devolução (portador inicia → porteiro confirma)', async ({ page }, testInfo) => {
        const isMobile = testInfo.project.name === 'mobile';

        // ── FLUXO 2: RETIRADA ─────────────────────────────────────────
        // Aluno solicita a chave para si mesmo no dashboard
        await login(page, 'e2e_aluno');
        await expectNoHorizontalScroll(page);

        await openKeyAction(page, isMobile, 'Solicitar', 'Solicitar Retirada?');
        await page.getByRole('button', { name: 'Enviar solicitação', exact: true }).click();

        // Aluno iniciou → já confirmou como usuário; aguarda o porteiro
        await page.goto('/confirm');
        await expect(page.getByText('Aguardando porteiro')).toBeVisible();
        await expectNoHorizontalScroll(page);

        // Porteiro confirma na Central de Confirmações
        await logout(page);
        await login(page, 'e2e_porteiro');
        await page.goto('/confirm');
        await expect(page.getByText(KEY_NAME)).toBeVisible();
        await page.getByRole('button', { name: /Confirmar/ }).first().click();
        await expect(page.getByText('Nenhuma confirmação pendente no momento.')).toBeVisible();

        // ── FLUXO 3: DEVOLUÇÃO (iniciada pelo portador) ───────────────
        // O aluno portador vê a ação de devolver no dashboard
        await logout(page);
        await login(page, 'e2e_aluno');
        await openKeyAction(page, isMobile, 'Devolver', 'Solicitar Devolução?');
        await page.getByRole('button', { name: 'Enviar solicitação', exact: true }).click();

        // Porteiro fecha o ciclo na Central de Confirmações
        await logout(page);
        await login(page, 'e2e_porteiro');
        await page.goto('/confirm');
        await expect(page.getByText(KEY_NAME)).toBeVisible();
        const confirmBtn = page.getByRole('button', { name: /Confirmar/ }).first();
        // Alvo de toque ≥ 44px no botão do fluxo crítico (spec §6)
        const box = await confirmBtn.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await confirmBtn.click();

        // Chave volta a 'disponível' — ciclo completo, estado restaurado
        await page.goto('/');
        const keyContainer = isMobile
            ? page.locator('.key-card', { hasText: KEY_NAME })
            : page.locator('.dashboard-list-row', { hasText: KEY_NAME });
        await expect(keyContainer.getByText(/dispon[ií]vel/i)).toBeVisible();
        await expectNoHorizontalScroll(page);
    });
});
