import { test, expect } from '@playwright/test';
import { login, expectNoHorizontalScroll } from './helpers';

// REQ-016 — nenhuma tela pode gerar scroll horizontal (viewport >= 360px).
// Regressão: na visão da portaria o Dashboard estourava a largura por dois motivos
//   1) os tooltips decorativos ([data-tooltip]::after, nowrap + opacity:0) continuam
//      no layout mesmo invisíveis; junto à borda direita (o "X" da dica de dupla
//      confirmação) vazavam ~6px além da viewport;
//   2) na lista desktop os dois botões de ação (Devolver + Transferir) transbordavam
//      a coluna fixa de 120px.
// O porteiro vê chaves em uso (dois botões) E a dica — cobre ambos os casos.
// Roda nos dois projetos (desktop 1280 e mobile 375) definidos no playwright.config.
test.describe('Sem scroll horizontal na portaria (REQ-016)', () => {
    test('dashboard do porteiro não gera scroll horizontal', async ({ page }) => {
        await login(page, 'e2e_porteiro');
        // A lista precisa estar renderizada (chaves seedadas em uso + disponíveis).
        await expect(page.getByText('Monitoramento de Chaves')).toBeVisible();
        await expectNoHorizontalScroll(page);
    });
});
