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
        // da chave (regra "uma pendência por chave") ou a própria chave em uso
        // (retirada completada sem o restore rodar).
        const leftovers = await (await page.request.get('/api/transactions/pending')).json();
        for (const t of leftovers.filter((t: { key_name: string }) => t.key_name === KEY)) {
            await page.request.post(`/api/transactions/${t.id}/cancel`);
        }
        const keysStart = await (await page.request.get('/api/keys')).json();
        const dirty = keysStart.find((k: { name: string; status: string; id: number; user_id?: number }) => k.name === KEY);
        if (dirty?.status === 'in_use') {
            await page.request.post('/api/transactions', {
                data: { action: 'return', key_id: dirty.id, user_id: dirty.user_id, bypassConfirmation: true, justification: 'Saneamento do estado de teste' },
            });
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
        // A retirada foi iniciada pelo porteiro (lado da portaria já confirmado na
        // criação): a confirmação do aluno COMPLETA a transação — o item some do
        // painel e a chave muda de estado, tudo sem navegar.
        await expect(page.locator('.pending-inline .pending-inline-item', { hasText: KEY })).toHaveCount(0, { timeout: 10_000 });
        const keysAfter = await (await page.request.get('/api/keys')).json();
        const keyAfter = keysAfter.find((k: { name: string; status: string; id: number; user_id?: number }) => k.name === KEY);
        expect(keyAfter?.status).toBe('in_use');

        // ── Restaura o estado: porteiro força a devolução (bypass + justificativa) ──
        await logout(page);
        await login(page, 'e2e_porteiro');
        const restore = await page.request.post('/api/transactions', {
            data: { action: 'return', key_id: keyAfter.id, user_id: keyAfter.user_id, bypassConfirmation: true, justification: 'Restauração do estado de teste' },
        });
        expect(restore.ok()).toBeTruthy();
        const finalKeys = await (await page.request.get('/api/keys')).json();
        expect(finalKeys.find((k: { name: string }) => k.name === KEY)?.status).toBe('available');
    });
});
