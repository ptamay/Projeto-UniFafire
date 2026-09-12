import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

// TASK-052 — a aba de ENTRADA do Dashboard depende do papel, e a ordem dos chips também:
//   ALUNO/FUNCIONARIO → "Minhas Chaves" primeiro e ativa (quem porta chave quer as dele);
//   PORTEIRO          → sem "Minhas Chaves", "Disponíveis" ativa (o balcão entrega chave);
//   ADMIN/GESTOR      → sem "Minhas Chaves", "Todas" ativa (visão de gestão).
//
// TASK-120 — este spec nasceu com a TASK-052 e NUNCA passou: procurava um `h1`
// "Dashboard" (o título é "Monitoramento de Chaves") e classes Tailwind de exemplo
// ("bg-white") que o componente não usa. Agora cobra o contrato do componente: os
// chips são `.dashboard-filter-chip`, e o ativo é o `btn-green`.

const chips = (page: Page) => page.locator('.dashboard-filter-chip');

async function abrirDashboard(page: Page, usuario: string) {
    await login(page, usuario);
    // O heading real — o esqueleto do `loading.tsx` repete o título com `aria-hidden`.
    await expect(page.getByRole('heading', { name: 'Monitoramento de Chaves', level: 1 })).toBeVisible();
}

async function expectAbas(page: Page, rotulos: RegExp[], ativa: RegExp) {
    await expect(chips(page)).toHaveText(rotulos);
    // Exatamente UMA ativa, e é a esperada.
    await expect(page.locator('.dashboard-filter-chip.btn-green')).toHaveCount(1);
    await expect(page.locator('.dashboard-filter-chip.btn-green')).toHaveText(ativa);
}

test.describe('Dashboard — aba de entrada por papel (TASK-052)', () => {
    test('ALUNO entra em "Minhas Chaves", a primeira aba', async ({ page }) => {
        await abrirDashboard(page, 'e2e_aluno');
        await expectAbas(page, [/^Minhas Chaves/, /^Todas$/, /^Disponíveis$/, /^Em Uso$/], /^Minhas Chaves/);
    });

    test('PORTEIRO não tem "Minhas Chaves" e entra em "Disponíveis"', async ({ page }) => {
        await abrirDashboard(page, 'e2e_porteiro');
        await expectAbas(page, [/^Todas$/, /^Disponíveis$/, /^Em Uso$/], /^Disponíveis$/);
    });

    test('ADMIN não tem "Minhas Chaves" e entra em "Todas"', async ({ page }) => {
        await abrirDashboard(page, 'e2e_admin');
        await expectAbas(page, [/^Todas$/, /^Disponíveis$/, /^Em Uso$/], /^Todas$/);
    });
});
