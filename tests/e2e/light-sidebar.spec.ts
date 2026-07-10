import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

// TASK-051 (REQ-029d, ADR-010) — light mode integral: no tema claro a sidebar
// deixa de ser escura fixa e passa a acompanhar o tema com contraste AA.
// Roda no desktop (sidebar sempre visível); no mobile é drawer, coberto pelo
// mesmo CSS .light-mode .sidebar.

// Luminância relativa (WCAG) de um "rgb(r, g, b)".
function luminance(rgb: string): number {
    const [r, g, b] = rgb.match(/\d+/g)!.slice(0, 3).map(Number).map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
    await page.evaluate((t) => {
        localStorage.setItem('theme', t);
        document.documentElement.classList.toggle('light-mode', t === 'light');
    }, theme);
}

test.describe('Light mode integral — sidebar tematizada (REQ-029d)', () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.skip(testInfo.project.name === 'mobile', 'Sidebar é drawer no mobile; o CSS é o mesmo, verificado no desktop');
        await login(page, 'e2e_porteiro');
    });

    test('sidebar clara com AA no light; escura intocada no dark', async ({ page }) => {
        const sidebar = page.locator('.sidebar');
        const navItem = page.locator('.sidebar .nav-item').first();

        // ── Dark (padrão): sidebar escura ──
        await setTheme(page, 'dark');
        const darkBg = await sidebar.evaluate(el => getComputedStyle(el).backgroundColor);
        expect(luminance(darkBg)).toBeLessThan(0.2); // superfície escura

        // ── Light: sidebar clara, texto AA ──
        await setTheme(page, 'light');
        const lightBg = await sidebar.evaluate(el => getComputedStyle(el).backgroundColor);
        expect(luminance(lightBg)).toBeGreaterThan(0.5); // superfície clara

        const navColor = await navItem.evaluate(el => getComputedStyle(el).color);
        // texto do item de nav contrasta AA (≥4.5:1) com o fundo claro da sidebar
        expect(contrast(navColor, lightBg)).toBeGreaterThanOrEqual(4.5);
    });
});
