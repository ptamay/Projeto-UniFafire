import { test, expect } from '@playwright/test';

test.describe('Autenticação', () => {
  test('deve permitir login como admin e redirecionar para dashboard', async ({ page }) => {
    await page.goto('/login');
    
    // Preenche o formulário
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'admin'); // ou a senha padrão
    
    // Clica no botão de login
    await page.click('button[type="submit"]');
    
    // Espera navegar para o dashboard (a URL deve ser /)
    await expect(page).toHaveURL('/');
    
    // Verifica se a barra lateral está visível
    await expect(page.locator('.sidebar-nav')).toBeVisible();
    
    // Verifica se há o menu "Administração" (específico do admin)
    await expect(page.locator('text=Administração')).toBeVisible();
  });
});
