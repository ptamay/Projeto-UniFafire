import { test, expect } from '@playwright/test';

// TASK-122 — FALHA PLANTADA, revertida no commit seguinte. Prova que um spec vermelho
// deixa o check do CI vermelho — mesmo depois de a vitest já ter falhado (`!cancelled()`).
test('PROVA TASK-122: a E2E reprova o check', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#btn-login')).toHaveText('texto que não existe', { timeout: 2000 });
});
