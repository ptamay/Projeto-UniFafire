import { test, expect } from '@playwright/test';
import { loginAsRole } from './helpers';

test.describe('Dashboard Priority Tabs', () => {
  test('User with "Minhas chaves" tab (FUNC) should see it as default', async ({ page }) => {
    // Role FUNCIONARIO sees "Minhas chaves"
    await loginAsRole(page, 'FUNCIONARIO');

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
    await loginAsRole(page, 'PORTEIRO');

    // Wait for dashboard to load
    await expect(page.locator('h1', { hasText: 'Dashboard' })).toBeVisible();

    const tabButtons = page.locator('.flex.space-x-1.rounded-xl.bg-surface-elevated button');
    
    // First tab should be "Disponíveis"
    await expect(tabButtons.nth(0)).toHaveText(/Disponíveis/i);

    // Verify it is active by default
    const firstTabClass = await tabButtons.nth(0).getAttribute('class');
    expect(firstTabClass).toContain('bg-white');
  });
});
