import { test, expect, Page } from '@playwright/test';
import { login, logout } from './helpers';

// TASK-049 (REQ-029b, ADR-010) — pendências inline no Dashboard: ver e
// confirmar/cancelar sem navegar a /confirm. Reutiliza os endpoints existentes
// (pending / user-confirm / cancel); /confirm permanece como visão completa.

const KEY = 'Chave E2E';

async function createPendingWithdraw(page: Page) {
    // porteiro cria uma retirada pendente (dupla confirmação) para o Aluno E2E
    const keys = await (await page.request.get('/api/keys')).json();
    const key = keys.find((k: { name: string }) => k.name === KEY);
    const users = await (await page.request.get('/api/users')).json();
    const aluno = users.find((u: { username: string }) => u.username === 'e2e_aluno');
    const res = await page.request.post('/api/transactions', {
        data: { action: 'withdraw', key_id: key.id, user_id: aluno.id },
    });
    expect(res.ok()).toBeTruthy();
}

test.describe('Pendências inline no Dashboard (REQ-029b)', () => {
    test('painel aparece com a pendência, cancela e confirma sem trocar de tela', async ({ page }, testInfo) => {
        const isMobile = testInfo.project.name === 'mobile';

        // ── Sem pendências: sem painel ──
        await login(page, 'e2e_porteiro');
        // Auto-saneamento: um run anterior falho pode ter deixado pendência órfã
        // da chave (regra "uma pendência por chave" rejeitaria a criação abaixo).
        const leftovers = await (await page.request.get('/api/transactions/pending')).json();
        for (const t of leftovers.filter((t: { key_name: string }) => t.key_name === KEY)) {
            await page.request.post(`/api/transactions/${t.id}/cancel`);
        }
        await page.reload();
        await expect(page.locator('.pending-inline')).toHaveCount(0);

        // ── Pendência criada aparece no painel, sem navegar ──
        await createPendingWithdraw(page);
        const panel = page.locator('.pending-inline');
        await expect(panel).toBeVisible({ timeout: 10_000 });
        const item = panel.locator('.pending-inline-item', { hasText: KEY });
        await expect(item).toBeVisible();
        await expect(item).toContainText(/retirada/i);
        // porteiro ainda não pode confirmar (falta o usuário) — vê o estado e pode cancelar
        await expect(item).toContainText(/aguardando/i);

        // Regressão: o badge de Confirmações reflete a pendência (sidebar no desktop)
        if (!isMobile) {
            await expect(page.locator('.sidebar')).toContainText('1');
        }

        // ── Cancelar pelo painel remove a pendência (e o painel some) ──
        await item.getByRole('button', { name: /cancelar/i }).click();
        await expect(page.locator('.pending-inline')).toHaveCount(0, { timeout: 10_000 });

        // ── Confirmar pelo painel (lado do usuário) conclui a transação ──
        await createPendingWithdraw(page);
        await logout(page);
        await login(page, 'e2e_aluno');
        const alunoItem = page.locator('.pending-inline .pending-inline-item', { hasText: KEY });
        await expect(alunoItem).toBeVisible({ timeout: 10_000 });
        await alunoItem.getByRole('button', { name: /confirmar/i }).click();
        // some do painel do aluno...
        await expect(page.locator('.pending-inline .pending-inline-item', { hasText: KEY })).toHaveCount(0, { timeout: 10_000 });
        // ...e a retirada foi confirmada pelo lado do usuário (user_confirmed_at preenchido)
        const stillPending = await (await page.request.get('/api/transactions/pending')).json();
        const tx = stillPending.find((t: { key_name: string }) => t.key_name === KEY);
        expect(tx?.user_confirmed_at).toBeTruthy();

        // ── Restaura o estado: porteiro cancela a pendência restante via API ──
        await logout(page);
        await login(page, 'e2e_porteiro');
        const cancel = await page.request.post(`/api/transactions/${tx.id}/cancel`);
        expect(cancel.ok()).toBeTruthy();
        const finalPending = await (await page.request.get('/api/transactions/pending')).json();
        expect(finalPending.find((t: { key_name: string }) => t.key_name === KEY)).toBeFalsy();
    });
});
