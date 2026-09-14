import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

// TASK-125 (CR Tipo C · ADR-027) — ao trocar de tela, o menu fica.
//
// O relato do usuário, com captura: navegando entre telas, o menu some e só o esqueleto do
// conteúdo aparece. Causa: cada tela desenhava o próprio menu, e o `loading.tsx` troca a
// página inteira.
//
// ## Como esta prova não depende de sorte
//
// Flagrar o esqueleto num instante exato é frágil (em build de produção ele dura
// milissegundos). Em vez disso, um `MutationObserver` instalado ANTES do clique registra
// cada mudança do DOM durante a navegação:
//   - se o elemento do menu SAIU do documento em algum momento (desmontou);
//   - e, em cada mudança em que o esqueleto (`main[aria-busy="true"]`) estava presente, se o
//     menu estava lá e visível.
// No fim, o elemento do menu tem de ser O MESMO objeto de antes do clique.
//
// No celular o menu lateral é gaveta fechada; o que se vê é a barra superior, que é parte do
// mesmo componente — é ela que se observa lá.

async function observarMenu(page: Page, seletor: string) {
    await page.evaluate((sel) => {
        const menu = document.querySelector(sel);
        const w = window as unknown as { __menu: Element | null; __saiu: boolean; __esqueletoSemMenu: number; __esqueletoVisto: number };
        w.__menu = menu;
        w.__saiu = false;
        w.__esqueletoSemMenu = 0;
        w.__esqueletoVisto = 0;
        new MutationObserver(() => {
            if (!menu || !menu.isConnected) w.__saiu = true;
            if (document.querySelector('main[aria-busy="true"]')) {
                w.__esqueletoVisto++;
                const atual = document.querySelector(sel) as HTMLElement | null;
                if (!atual || atual.getBoundingClientRect().height === 0) w.__esqueletoSemMenu++;
            }
        }).observe(document.body, { childList: true, subtree: true });
    }, seletor);
}

const estado = (page: Page, seletor: string) => page.evaluate((sel) => {
    const w = window as unknown as { __menu: Element | null; __saiu: boolean; __esqueletoSemMenu: number; __esqueletoVisto: number };
    return {
        mesmoElemento: document.querySelector(sel) === w.__menu,
        saiu: w.__saiu,
        esqueletoSemMenu: w.__esqueletoSemMenu,
        esqueletoVisto: w.__esqueletoVisto,
    };
}, seletor);

test.describe('TASK-125 — o menu não sai na navegação (ADR-027)', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, 'e2e_porteiro');
    });

    test('ida e volta entre telas: o menu é o mesmo elemento, nunca sai, e acompanha o esqueleto', async ({ page }, testInfo) => {
        const celular = testInfo.project.name === 'mobile';
        const menu = celular ? '.mobile-topbar' : 'aside.sidebar';
        const nav = celular ? '.mobile-bottom-nav' : 'aside.sidebar';

        await expect(page.locator(menu)).toBeVisible();
        // O indicador do `next dev` (canto inferior esquerdo) fica em cima da barra inferior do
        // celular e intercepta o clique no primeiro item. Só existe em desenvolvimento.
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        await observarMenu(page, menu);

        // Chaves e Confirmações estão nas duas superfícies (menu lateral e barra inferior
        // do celular) para o PORTEIRO — o mesmo percurso nos dois projetos.
        for (const destino of ['/keys', '/confirm', '/']) {
            await page.locator(`${nav} a[href="${destino}"]`).first().click();
            await expect(page).toHaveURL(destino);
            await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
            await expect(page.locator(menu)).toBeVisible();
        }

        const r = await estado(page, menu);
        expect(r.saiu, 'o menu saiu do documento durante a navegação (desmontou)').toBe(false);
        expect(r.mesmoElemento, 'o menu depois da navegação é OUTRO elemento — foi remontado').toBe(true);
        expect(r.esqueletoSemMenu, `em ${r.esqueletoSemMenu} de ${r.esqueletoVisto} quadros com esqueleto, o menu não estava na tela`).toBe(0);
    });
});
