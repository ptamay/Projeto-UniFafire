import { test, expect, Page } from '@playwright/test';
import { login, logout } from './helpers';

// TASK-137 (emenda do ADR-031 · REQ-033) — o que ficou fora do quadro de chaves, medido na
// tela a 360×640: "Passar" de volta a botão, "em uso" vermelho, Usuários com a busca
// primeiro, Confirmações em linhas, Logs em português, a explicação do Dashboard numa linha.

const KEY = 'Chave E2E';

async function noCelular(page: Page) {
    await page.setViewportSize({ width: 360, height: 640 });
}

async function abrir(page: Page, rota: string, espera: string) {
    await page.goto(rota);
    await page.waitForLoadState('load');
    await page.locator(espera).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
}

/** Matiz e saturação de uma cor `rgb(…)` computada. */
function matiz(rgb: string): { h: number; s: number } {
    const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(v => Number(v) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    return { h: (h + 360) % 360, s };
}

test.describe('TASK-137 — emenda do celular', () => {
    test.beforeEach(({}, info) => {
        test.skip(info.project.name !== 'mobile', 'critério do celular');
    });

    test('plaqueta de quem pode devolver: "Devolver" e "Passar" lado a lado, botões de verdade, sem espremer o nome', async ({ page }) => {
        await noCelular(page);
        await login(page, 'e2e_admin');
        await page.locator('.plaqueta').first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('.plaqueta-extra')).toHaveCount(0);
        const comDevolver = page.locator('.plaqueta--em-uso', { has: page.getByRole('button', { name: 'Devolver' }) });
        expect(await comDevolver.count(), 'nenhuma chave em uso com "Devolver" para medir').toBeGreaterThan(0);
        const medidas = await comDevolver.evaluateAll(els => els.map(el => {
            const botoes = [...el.querySelectorAll('.plaqueta-acoes button')];
            const devolver = botoes.find(b => b.textContent?.trim() === 'Devolver');
            const passar = botoes.find(b => b.getAttribute('aria-label') === 'Passar para outra pessoa');
            const caixa = (x: Element | undefined) => x ? x.getBoundingClientRect() : null;
            return {
                nome: el.querySelector('.plaqueta-nome')?.textContent?.trim(),
                larguraDaLinha: el.getBoundingClientRect().width,
                larguraDoTexto: el.querySelector('.plaqueta-texto')!.getBoundingClientRect().width,
                devolver: caixa(devolver),
                passar: caixa(passar),
                textoDoPassar: passar?.textContent?.trim(),
            };
        }));
        for (const m of medidas) {
            expect(m.passar, `"${m.nome}": falta o botão "Passar" ao lado de "Devolver"`).not.toBeNull();
            expect(m.textoDoPassar).toBe('Passar');
            expect(Math.abs(m.passar!.top - m.devolver!.top), `"${m.nome}": "Passar" não está na linha de "Devolver"`).toBeLessThanOrEqual(2);
            expect(m.passar!.height, 'botão abaixo do alvo de toque').toBeGreaterThanOrEqual(44);
            expect(m.devolver!.height, 'botão abaixo do alvo de toque').toBeGreaterThanOrEqual(44);
            expect(m.larguraDoTexto, `"${m.nome}": o nome ficou espremido pelos botões`).toBeGreaterThanOrEqual(m.larguraDaLinha * 0.8);
        }
        await comDevolver.first().getByRole('button', { name: 'Passar para outra pessoa' }).click();
        await expect(page.locator('.modal-overlay')).toBeVisible();
    });

    for (const tema of ['light', 'dark'] as const) {
        test(`tema ${tema}: "Com Fulano" é vermelho — a chave está ocupada`, async ({ page }) => {
            await page.emulateMedia({ colorScheme: tema });
            await noCelular(page);
            await login(page, 'e2e_admin');
            const estado = page.locator('.plaqueta--em-uso .plaqueta-estado').first();
            await estado.waitFor();
            const { cor, anel } = await estado.evaluate(el => ({
                cor: getComputedStyle(el).color,
                anel: getComputedStyle(el, '::before').boxShadow,
            }));
            const texto = matiz(cor);
            expect(texto.s > 0.3 && (texto.h < 20 || texto.h > 330), `"em uso" em ${cor} não é vermelho`).toBe(true);
            // A forma continua dizendo o estado para quem não distingue cor: anel vazio.
            expect(anel).toMatch(/inset/);
        });
    }

    test('Usuários: a busca é o primeiro controle, "+ Novo" ao lado dela, os filtros por papel embaixo', async ({ page }) => {
        await noCelular(page);
        await login(page, 'e2e_admin');
        await abrir(page, '/users', '.lista-linhas .linha-lista');
        const m = await page.evaluate(() => {
            const main = document.querySelector('main.main-content')!;
            const visivel = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
            const controles = [...main.querySelectorAll('input, select, button, a[href]')].filter(visivel)
                .map(el => ({ el, r: el.getBoundingClientRect() }))
                .sort((a, b) => (Math.abs(a.r.top - b.r.top) > 8 ? a.r.top - b.r.top : a.r.left - b.r.left));
            const busca = main.querySelector('input[type="search"]')!.getBoundingClientRect();
            const novo = [...main.querySelectorAll('button')].filter(visivel).filter(b => /Novo usu/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
            const filtro = main.querySelector('.filtro-papel')!.getBoundingClientRect();
            return {
                primeiro: controles[0].el.getAttribute('aria-label') ?? controles[0].el.textContent?.trim(),
                primeiroEBusca: controles[0].el.matches('input[type="search"]'),
                novos: novo.length,
                novoNaLinhaDaBusca: novo.length === 1 && Math.abs(novo[0].getBoundingClientRect().top + novo[0].getBoundingClientRect().height / 2 - (busca.top + busca.height / 2)) <= 4,
                filtroAbaixoDaBusca: filtro.top >= busca.bottom,
                topoDaPrimeiraLinha: main.querySelector('.lista-linhas .linha-lista')!.getBoundingClientRect().top,
                barraInferior: document.querySelector('.mobile-bottom-nav')!.getBoundingClientRect().top,
            };
        });
        expect(m.primeiroEBusca, `o primeiro controle é "${m.primeiro}", não a busca`).toBe(true);
        expect(m.novos, 'um "Novo usuário" só à vista no celular').toBe(1);
        expect(m.novoNaLinhaDaBusca, '"+ Novo" não está na linha da busca').toBe(true);
        expect(m.filtroAbaixoDaBusca, 'os filtros por papel vêm antes da busca').toBe(true);
        expect(m.topoDaPrimeiraLinha, 'o primeiro usuário não aparece sem rolar').toBeLessThan(m.barraInferior - 40);
    });

    test('Confirmações: cada pendência é uma linha com o verbo, e "Cancelar" limpa', async ({ page }) => {
        await noCelular(page);
        await login(page, 'e2e_porteiro');
        // Saneamento (como em pending-inline): pendência órfã da chave ou a chave em uso.
        const sobras = await (await page.request.get('/api/transactions/pending')).json();
        for (const t of sobras.filter((t: { key_name: string }) => t.key_name === KEY)) {
            await page.request.post(`/api/transactions/${t.id}/cancel`);
        }
        const chaves = await (await page.request.get('/api/keys')).json();
        const chave = chaves.find((k: { name: string }) => k.name === KEY);
        if (chave.status === 'in_use') {
            await page.request.post('/api/transactions', {
                data: { action: 'return', key_id: chave.id, user_id: chave.user_id, bypassConfirmation: true, justification: 'Saneamento do estado de teste' },
            });
        }
        const usuarios = await (await page.request.get('/api/users')).json();
        const aluno = usuarios.find((u: { username: string }) => u.username === 'e2e_aluno');
        const criada = await page.request.post('/api/transactions', { data: { action: 'withdraw', key_id: chave.id, user_id: aluno.id } });
        expect(criada.ok()).toBeTruthy();

        await abrir(page, '/confirm', '.lista-linhas .linha-lista');
        const linha = page.locator('.lista-linhas .linha-lista', { hasText: KEY });
        await expect(linha).toBeVisible();
        await expect(linha).toContainText('Aguardando o usuário confirmar');
        await expect(linha.getByRole('button', { name: /Cancelar/ })).toBeVisible();
        const m = await linha.evaluate(el => ({
            altura: el.getBoundingClientRect().height,
            topo: el.getBoundingClientRect().top,
            barraInferior: document.querySelector('.mobile-bottom-nav')!.getBoundingClientRect().top,
            cartao: getComputedStyle(el).borderRadius !== '0px',
        }));
        expect(m.cartao, 'a pendência ainda é um cartão').toBe(false);
        expect(m.altura, 'a pendência ocupa mais que uma linha de lista').toBeLessThan(220);
        expect(m.topo, 'a primeira pendência não aparece sem rolar').toBeLessThan(m.barraInferior - 40);

        await logout(page);
        await login(page, 'e2e_aluno');
        await abrir(page, '/confirm', '.lista-linhas .linha-lista');
        const minha = page.locator('.lista-linhas .linha-lista', { hasText: KEY });
        const confirmar = minha.getByRole('button', { name: /Confirmar/ });
        await expect(confirmar).toBeVisible();
        await expect(confirmar).toHaveClass(/btn-secundario/);
        await minha.getByRole('button', { name: /Cancelar/ }).click();
        await expect(page.locator('.lista-linhas .linha-lista', { hasText: KEY })).toHaveCount(0);
    });

    test('Logs: cada registro diz a ação em palavra; o código gravado vem pequeno, ao lado', async ({ page }) => {
        await noCelular(page);
        await login(page, 'e2e_admin');
        await abrir(page, '/logs', '.lista-linhas .linha-lista');
        const linhas = await page.locator('.lista-linhas .linha-lista').evaluateAll(els => els.map(el => {
            const codigo = el.querySelector('.codigo-trilha');
            return {
                nome: el.querySelector('.linha-nome')?.textContent?.trim() ?? '',
                codigo: codigo?.textContent?.trim() ?? null,
                tamanhoDoCodigo: codigo ? getComputedStyle(codigo).fontSize : null,
            };
        }));
        expect(linhas.length).toBeGreaterThan(0);
        for (const l of linhas) {
            expect(l.nome, `a linha começa pelo código de sistema: "${l.nome}"`).not.toMatch(/^[A-Z][A-Z_]+\b/);
            expect(l.codigo, `"${l.nome}" sem o código gravado ao lado`).toBeTruthy();
            expect(l.tamanhoDoCodigo).toBe('12px');
        }
        await expect(page.locator('main')).not.toContainText(/User logged in|Invalid password/);
    });

    test('Dashboard: a explicação da dupla confirmação é uma linha fechada que abre ao toque', async ({ page }) => {
        await noCelular(page);
        await login(page, 'e2e_aluno');
        const explicacao = page.locator('.dashboard-explicacao details');
        await expect(explicacao).toBeVisible();
        const altura = (await explicacao.boundingBox())!.height;
        expect(altura, 'a explicação fechada ocupa mais que uma linha').toBeLessThanOrEqual(60);
        const texto = page.locator('.dashboard-explicacao details p');
        await expect(texto).toBeHidden();
        await explicacao.locator('summary').click();
        await expect(texto).toBeVisible();
        await expect(texto).toContainText('confirma');
    });
});
