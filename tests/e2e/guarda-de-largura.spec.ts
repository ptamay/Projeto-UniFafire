import { test, expect, Page } from '@playwright/test';
import { expectNoHorizontalScroll } from './helpers';

// TASK-118 (REQ-016) — a guarda de largura precisa ENXERGAR o corte que a TASK-117
// corrigiu. Ela não enxergava.
//
// `expectNoHorizontalScroll` media `documentElement.scrollWidth - clientWidth`. No
// celular, `globals.css` tem `html, body { overflow-x: hidden }`: o `html` passa o
// overflow para a viewport, o `body` vira container de rolagem próprio e segura a
// sobra dentro dele — o documento nunca fica mais largo que a tela. Medido no Dashboard
// de ALUNO a 375 px: `documentElement.scrollWidth` = 375, `body.scrollWidth` = 462 e
// `.main-content` com 462 px. Conteúdo cortado, guarda verde.
//
// Este spec não depende do app nem do banco: monta a MESMA forma de página que o
// `globals.css` produz no celular e cobra a guarda nos dois sentidos. É a guarda da
// guarda — as duas vezes em que uma guarda deste projeto nasceu cega (TASK-090), o que
// a denunciou foi exigir que ela reprovasse o caso ruim, e não só contar quantos
// cenários passavam.

const LARGURA = 375;
// Sem ela o projeto `mobile` (isMobile) diagrama em 980 px, como um celular faz com
// página sem meta viewport — e o app tem a meta.
const META = '<meta name="viewport" content="width=device-width, initial-scale=1">';

/** A forma do shell no celular: `.page-wrapper` flex, `.main-content` item flex com
 *  `overflow-x: clip`, e uma barra de 4 chips `nowrap` que deveria rolar sozinha. */
function pagina({ mainEncolhe }: { mainEncolhe: boolean }): string {
    return `<!doctype html><html><head>${META}<style>
        html, body { margin: 0; overflow-x: hidden; }
        .page-wrapper { display: flex; min-height: 100vh; }
        .main-content { flex: 1; padding: 16px; overflow-x: clip; ${mainEncolhe ? 'min-width: 0;' : ''} }
        .barra { display: flex; gap: 12px; overflow-x: auto; }
        .chip { flex: 0 0 auto; white-space: nowrap; width: 100px; }
    </style></head><body>
        <div class="page-wrapper"><main class="main-content">
            <h1>Dashboard</h1>
            <div class="barra">
                <span class="chip">Minhas Chaves</span><span class="chip">Todas</span>
                <span class="chip">Disponíveis</span><span class="chip">Em Uso</span>
            </div>
        </main></div>
    </body></html>`;
}

async function montar(page: Page, html: string) {
    await page.setViewportSize({ width: LARGURA, height: 812 });
    await page.setContent(html);
}

test.describe('A guarda de largura enxerga o conteúdo, não só o documento (TASK-118)', () => {
    test('premissa: a página de prova reproduz o defeito — o main passa da tela e o documento não', async ({ page }) => {
        // Se esta premissa cair, o cenário seguinte deixa de provar alguma coisa.
        await montar(page, pagina({ mainEncolhe: false }));
        const m = await page.evaluate(() => ({
            documento: document.documentElement.scrollWidth,
            main: document.querySelector('.main-content')!.getBoundingClientRect().width,
        }));
        expect(m.documento).toBe(LARGURA);
        expect(m.main).toBeGreaterThan(LARGURA);
    });

    test('BDD: com o main mais largo que a tela, a guarda REPROVA', async ({ page }) => {
        await montar(page, pagina({ mainEncolhe: false }));
        await expect(expectNoHorizontalScroll(page), 'a guarda deixou passar conteúdo cortado').rejects.toThrow();
    });

    test('com o main contido e a barra rolando sozinha, a guarda aprova', async ({ page }) => {
        // Rolagem INTERNA de um componente não é scroll da página: a guarda não pode
        // confundir a barra de filtros rolando com o defeito.
        await montar(page, pagina({ mainEncolhe: true }));
        await expectNoHorizontalScroll(page);
    });

    test('o caso que a guarda antiga pegava continua pego: documento mais largo que a tela', async ({ page }) => {
        await montar(page, `<!doctype html><html><head>${META}</head><body style="margin:0">
            <div style="width:${LARGURA + 40}px;height:10px"></div></body></html>`);
        await expect(expectNoHorizontalScroll(page)).rejects.toThrow();
    });
});
