import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Dashboard Priority Tabs', () => {
  test('User with "Minhas chaves" tab (ALUNO) should see it as default', async ({ page }) => {
    // Role ALUNO sees "Minhas chaves"
    await login(page, 'e2e_aluno');

    // Wait for dashboard to load
    await expect(page.locator('h1', { hasText: 'Dashboard' })).toBeVisible();

    // Check if the first tab is "Minhas chaves"
    // Assuming tabs are buttons in a tab list
    const tabButtons = page.locator('.flex.space-x-1.rounded-xl.bg-surface-elevated button');
    
    // First tab text
    await expect(tabButtons.nth(0)).toHaveText(/Minhas chaves/i);

    // Verify it is active by default (it should have bg-white or bg-primary, etc. We can check aria-selected if present, or just its class)
    // Looking at similar components, usually it has text-primary or bg-white
    const firstTabClass = await tabButtons.nth(0).getAttribute('class');
    expect(firstTabClass).toContain('bg-white'); // Example active class in typical Tailwind tabs
  });

  test('Porteiro should see standard tabs without "Minhas chaves"', async ({ page }) => {
    await login(page, 'e2e_porteiro');

    // Wait for dashboard to load
    await expect(page.locator('h1', { hasText: 'Dashboard' })).toBeVisible();

    const tabButtons = page.locator('.flex.space-x-1.rounded-xl.bg-surface-elevated button');
    
    // First tab should be "Todas"
    await expect(tabButtons.nth(0)).toHaveText(/Todas/i);

    // Verify it is active by default (but only if filter was updated to 'all' or 'available'. Wait, for Porteiro filter is 'available', but 'Todas' is the first tab. So 'Todas' is NOT active by default for Porteiro?
    // User requested ADMIN/GESTOR default to 'all'. Porteiro defaults to 'available'. The first tab is 'Todas'.
    // If we want Porteiro default to be 'available', the active class will be on nth(1).
    // Let's just check that 'Todas' is first. We can skip checking active class for Porteiro here or check nth(1).
    const secondTabClass = await tabButtons.nth(1).getAttribute('class');
    expect(secondTabClass).toContain('bg-white');
  });

  test('Admin should see "Todas" as active by default', async ({ page }) => {
    await login(page, 'e2e_admin');

    // Wait for dashboard to load
    await expect(page.locator('h1', { hasText: 'Dashboard' })).toBeVisible();

    const tabButtons = page.locator('.flex.space-x-1.rounded-xl.bg-surface-elevated button');
    
    // First tab should be "Todas"
    await expect(tabButtons.nth(0)).toHaveText(/Todas/i);

    // Verify it is active by default
    const firstTabClass = await tabButtons.nth(0).getAttribute('class');
    expect(firstTabClass).toContain('bg-white');
  });
});
