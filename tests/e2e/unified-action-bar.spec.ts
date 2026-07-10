import { test, expect } from '@playwright/test';
import { login } from './helpers';

// TASK-048 (REQ-029a, ADR-010) — busca = Ação Rápida: um ÚNICO campo no desktop
// que filtra a lista em tempo real E registra pelo teclado (Enter age na sugestão).
// A barra unificada é desktop-only (no mobile vale a .mobile-touch-bar), então o
// spec roda apenas no projeto desktop.

test.describe('Campo único busca+ação no Dashboard desktop (REQ-029a)', () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.skip(testInfo.project.name === 'mobile', 'A barra unificada é desktop-only');
        await login(page, 'e2e_porteiro');
    });

    test('um único input na barra; digitar filtra a lista; Enter registra por teclado', async ({ page }) => {
        // 1) Exatamente UM campo de texto na barra de controle desktop
        //    (o input de busca separado não existe mais)
        const bar = page.locator('.unified-control-bar');
        await expect(bar).toBeVisible();
        await expect(bar.locator('input')).toHaveCount(1);
        const field = bar.locator('input').first();

        // Sonda de hidratação: o dropdown de sugestões só abre quando os handlers
        // React estão anexados — num load frio, um clique pré-hidratação deixa o
        // campo focado sem que o onFocus do React exista, e cliques repetidos não
        // re-disparam focus. Por isso cada tentativa DESFOCA (clica no título)
        // antes de clicar no campo de novo, até a hidratação concluir.
        await expect(page.locator('.dashboard-list-row')).toHaveCount(3);
        await expect(async () => {
            await page.locator('.page-title').click();
            await field.click();
            await expect(page.locator('#key-dropdown')).toBeVisible({ timeout: 1500 });
        }).toPass({ timeout: 30_000 });

        // 2) Digitar filtra a lista desktop em tempo real (comportamento da busca antiga)
        await field.fill('Devolver');
        await expect(page.locator('.dashboard-list-row')).toHaveCount(1);
        await expect(page.locator('.dashboard-list-row').first()).toContainText('Chave Devolver E2E');
        await field.fill('');
        await expect(page.locator('.dashboard-list-row')).toHaveCount(3);

        // 3) Retirada completa só por teclado: chave → Enter → pessoa → Enter → Enter no modal
        await field.fill('Chave E2E');
        await field.press('Enter');

        const emp = page.locator('#unified-emp-input');
        await expect(emp).toBeFocused();
        await emp.fill('Aluno E2E');
        await emp.press('Enter');

        // Modal abre com o botão primário focado — Enter envia a solicitação
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Enter');
        await expect(dialog).toBeHidden();

        // A pendência foi criada: a linha da chave mostra "Aguardando" — e o MESMO
        // campo continua filtrando a lista depois do registro.
        await field.fill('Chave E2E');
        await expect(page.locator('.dashboard-list-row')).toHaveCount(1);
        await expect(page.locator('.dashboard-list-row').first()).toContainText(/aguardando/i);

        // Restaura o estado para os próximos specs: cancela a pendência via API
        const pending = await (await page.request.get('/api/transactions/pending')).json();
        const tx = pending.find((t: { key_name: string; id: number }) => t.key_name === 'Chave E2E');
        expect(tx).toBeTruthy();
        const cancel = await page.request.post(`/api/transactions/${tx.id}/cancel`);
        expect(cancel.ok()).toBeTruthy();
    });
});
