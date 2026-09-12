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
        // Pelo heading, e não por texto: com o servidor frio, o esqueleto da TASK-096
        // (`loading.tsx`) tem um `sr-only` "Carregando Monitoramento de Chaves" e um h1
        // `aria-hidden` — `getByText` casava os dois e a medida podia sair do esqueleto.
        await expect(page.getByRole('heading', { name: 'Monitoramento de Chaves', level: 1 })).toBeVisible();
        await expectNoHorizontalScroll(page);
    });
});

// TASK-118 — o papel que a TASK-117 achou cortado, e que este spec não cobria.
// ALUNO e FUNCIONARIO têm QUATRO chips na barra de filtros (`Minhas Chaves` a mais que a
// portaria), 430 px de min-content: sem `min-width: 0` no `.main-content` o main ia a
// 462 px no celular. O porteiro, com três chips, cabe — por isso o spec acima nunca viu.
test.describe('Sem scroll horizontal para quem porta chave (REQ-016)', () => {
    test('dashboard do aluno, com a barra de 4 filtros, cabe na tela', async ({ page }) => {
        await login(page, 'e2e_aluno');
        // Premissa: a barra de QUATRO chips, que é o que alarga o main.
        await expect(page.locator('.dashboard-filter-chip')).toHaveCount(4);
        await expect(page.getByRole('button', { name: /^Minhas Chaves/ })).toBeVisible();
        await expectNoHorizontalScroll(page);
    });
});
