import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

// TASK-052 — a aba de ENTRADA do Dashboard depende do papel, e a ordem dos chips também:
//   ALUNO/FUNCIONARIO → "Minhas" primeiro e ativa (quem porta chave quer as dele);
//   PORTEIRO          → sem "Minhas", "Livres" ativa (o balcão entrega chave);
//   ADMIN/GESTOR      → sem "Minhas", "Todas" ativa (visão de gestão).
// TASK-134: os rótulos encurtaram ("Minhas Chaves" → "Minhas", "Disponíveis" → "Livres") e
// cada filtro traz a contagem depois da palavra ("Livres 9") — daí o \b no lugar do $.
//
// TASK-120 — este spec nasceu com a TASK-052 e NUNCA passou: procurava um `h1`
// "Dashboard" (o título é "Monitoramento de Chaves") e classes Tailwind de exemplo
// ("bg-white") que o componente não usa. Agora cobra o contrato do componente: os
// chips são `.dashboard-filter-chip`, e o ativo é o `btn-principal`.

const chips = (page: Page) => page.locator('.dashboard-filter-chip');

async function abrirDashboard(page: Page, usuario: string) {
    await login(page, usuario);
    // O heading real — o esqueleto do `loading.tsx` repete o título com `aria-hidden`.
    await expect(page.getByRole('heading', { name: 'Monitoramento de Chaves', level: 1 })).toBeVisible();
}

async function expectAbas(page: Page, rotulos: RegExp[], ativa: RegExp) {
    await expect(chips(page)).toHaveText(rotulos);
    // Exatamente UMA ativa, e é a esperada.
    await expect(page.locator('.dashboard-filter-chip.btn-principal')).toHaveCount(1);
    await expect(page.locator('.dashboard-filter-chip.btn-principal')).toHaveText(ativa);
}

test.describe('Dashboard — aba de entrada por papel (TASK-052)', () => {
    test('ALUNO entra em "Minhas Chaves", a primeira aba', async ({ page }) => {
        await abrirDashboard(page, 'e2e_aluno');
        await expectAbas(page, [/^Minhas\b/, /^Todas\b/, /^Livres\b/, /^Em uso\b/], /^Minhas\b/);
    });

    test('PORTEIRO não tem "Minhas Chaves" e entra em "Disponíveis"', async ({ page }) => {
        await abrirDashboard(page, 'e2e_porteiro');
        await expectAbas(page, [/^Todas\b/, /^Livres\b/, /^Em uso\b/], /^Livres\b/);
    });

    test('ADMIN não tem "Minhas Chaves" e entra em "Todas"', async ({ page }) => {
        await abrirDashboard(page, 'e2e_admin');
        await expectAbas(page, [/^Todas\b/, /^Livres\b/, /^Em uso\b/], /^Todas\b/);
    });
});
