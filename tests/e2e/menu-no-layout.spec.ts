import { test, expect, Page, TestInfo } from '@playwright/test';
import { Client } from 'pg';
import { E2E_DATABASE_URL } from './e2e-db';
import { login, E2E_PASSWORD } from './helpers';

// TASK-125 (CR Tipo C · ADR-027) — ao trocar de tela, o menu fica.
//
// O relato do usuário, com captura: navegando entre telas, o menu some e só o esqueleto do
// conteúdo aparece. Causa: cada tela desenhava o próprio menu, e o `loading.tsx` troca a
// página inteira.
//
// TASK-130 — a primeira versão desta prova andava por três telas (`/keys`, `/confirm`, `/`)
// como PORTEIRO, contra `next dev`, e nunca exigiu ter visto a espera: se a tela nova
// chegasse de uma vez, ela passava sem ter observado nada. E o relato de 2026-09-14 foi
// justamente no Histórico e nos Logs, que ela não visitava. Agora:
//   - percorre as NOVE telas do menu como ADMIN (o único papel que alcança todas);
//   - no celular, pelas superfícies de lá: barra inferior e gaveta ("Mais");
//   - SEGURA a renderização de cada página no servidor, para a espera durar de verdade;
//   - exige, em cada navegação, que a espera tenha durado pelo menos o tempo segurado;
//   - e confere, com JavaScript desligado, que o HTML do servidor de cada tela já MOSTRA o menu.
//
// Reprovada contra o código de antes do #84 (menu dentro de cada página), nos dois cenários e
// nos dois aparelhos — pelo motivo certo: o menu saiu do documento na primeira navegação, e com
// JavaScript desligado ele estava no HTML mas escondido.
//
// ## Onde a espera é segurada: na PÁGINA, não na resposta
//
// O que faz a espera durar em produção é a página esperando o banco, com o servidor já de pé.
// Toda página do grupo `(app)` passa por `verifySession`, que lê `users`; o layout e o
// `proxy.ts` leem só o JWT. Então um `LOCK TABLE users` numa transação da prova segura a PÁGINA
// e mais nada — como a consulta de `/keys` presa por LOCK com que a TASK-125 foi verificada no
// navegador, agora nas nove telas.
//
// Segurar a resposta RSC inteira (`page.route`) não reproduz isso. Medido em 2026-09-14, ainda
// com os `loading.tsx`: pelo `page.route` o esqueleto aparecia de 0 a ~20 quadros por navegação
// (zero em metade das telas) — justamente os quadros em que o defeito do #84 vivia; pelo LOCK,
// em ~75 a 90 de ~92.
//
// ## O que se observa: a JANELA DE ESPERA
//
// Em CADA quadro da espera:
//   - o menu está lá, com área, dentro da tela e POR CIMA (o ponto do centro dele cai dentro do
//     próprio menu — só "estar no DOM" aprovaria um menu coberto pelo conteúdo) — ADR-027;
//   - e o conteúdo é a tela ANTERIOR: nem esqueleto, nem branco — ADR-029 (TASK-128, #89). Esta
//     prova é também a guarda de regressão dela, a pedido da sessão que a fez: a do
//     `transicao-suave.spec.ts` segura a resposta pelo `page.route`, que não reproduz a espera
//     de produção (acima), e olha menos telas.
//
// A contagem de quadros sem conteúdo já achou um defeito: antes do #89, ao entrar em Meu Perfil
// pelo build de produção, a espera inteira ficava em branco (90 de 91 quadros sem `main` nenhum
// nem esqueleto; em `next dev`, nunca). Depois do #89, 0 quadros com esqueleto e 0 sem conteúdo
// nas 54 navegações medidas (nove telas × dois aparelhos × três rodadas).
//
// ## Como esta prova não depende de sorte
//
//   - a página não chega antes de a prova soltar o LOCK, em `next dev` e em build de produção;
//   - a janela abre no CLIQUE de verdade (ouvinte de `click` em captura, instalado antes) e
//     fecha quando existe um `.main-content` que não é o de antes do clique, na URL certa;
//   - um laço de `requestAnimationFrame` examina cada quadro da janela;
//   - a janela tem de ter durado pelo menos o tempo segurado — se a navegação vier de cache ou
//     a página deixar de ler `users`, a prova reprova em vez de passar sem ter visto nada;
//   - um `MutationObserver` acusa se o elemento do menu SAIU do documento, mesmo entre quadros;
//   - depois de cada navegação, o elemento do menu tem de ser O MESMO objeto de antes do
//     primeiro clique. As verificações são por navegação: a reprovação nomeia a tela.
//
// No celular o menu lateral é gaveta fechada; o que se vê é a barra superior e a barra
// inferior, que são parte do mesmo componente — são elas que se observam lá.
//
// `E2E_SERVIDOR=producao npm run test:e2e` roda contra o build de produção (ver
// `playwright.config.ts`).

/** Quanto tempo cada página fica segurada no servidor depois do clique. */
const SEGURAR_MS = 1500;

/** Segura a renderização de toda página do grupo `(app)`: elas leem `users` em `verifySession`,
 *  e a leitura espera o LOCK. Devolve a função que solta. */
async function segurarPaginas(banco: Client): Promise<() => Promise<void>> {
    await banco.query('BEGIN');
    await banco.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE');
    return async () => { await banco.query('ROLLBACK'); };
}

/** As telas do menu do ADMIN, na ordem do percurso. Termina no Dashboard (`/`), onde o login
 *  deixa; `conta` marca as que moram no menu do usuário, não na lista de telas. */
const PERCURSO: { href: string; conta?: true }[] = [
    { href: '/confirm' },
    { href: '/keys' },
    { href: '/history' },
    { href: '/users' },
    { href: '/logs' },
    { href: '/settings' },
    { href: '/account/profile', conta: true },
    { href: '/account/security', conta: true },
    { href: '/' },
];

type Espera = {
    destino: string;
    inicio: number;
    duracaoMs: number;
    quadros: number;
    quadrosComEsqueleto: number;
    quadrosSemConteudo: number;
    /** motivo → em quantos quadros */
    falhas: Record<string, number>;
};

type Janela = {
    __menu: Element | null;
    __saiu: boolean;
    __espera: Espera | null;
    __conteudoAntes: Element | null;
    __esperas: Espera[];
};

/** Instala a observação. `seletores` são as partes do menu que têm de estar visíveis em cada
 *  quadro da espera; a primeira é a que precisa ser o MESMO elemento no fim. */
async function observarMenu(page: Page, seletores: string[]) {
    await page.evaluate((sels) => {
        const w = window as unknown as Janela;
        w.__menu = document.querySelector(sels[0]);
        w.__saiu = false;
        w.__espera = null;
        w.__conteudoAntes = null;
        w.__esperas = [];

        // O que conta como menu para "estar por cima": as partes observadas e a gaveta — no
        // celular ela desliza para fora por cima da barra superior logo depois do clique.
        const menuInteiro = () => [...sels, 'aside.sidebar']
            .map(s => document.querySelector(s))
            .filter(Boolean) as Element[];

        const motivoSemMenu = (sel: string): string | null => {
            const el = document.querySelector(sel);
            if (!el) return `${sel} ausente`;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return `${sel} sem área`;
            if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return `${sel} fora da tela`;
            const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
            const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
            const topo = document.elementFromPoint(x, y);
            if (!topo || !menuInteiro().some(m => m.contains(topo))) {
                return `${sel} coberto por ${topo ? `${topo.tagName.toLowerCase()}.${topo.className}` : 'nada'}`;
            }
            return null;
        };

        const visivel = (el: Element) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };

        // A janela abre no clique em um link do menu — não antes, para não contar quadros
        // de antes da navegação como se fossem de espera.
        window.addEventListener('click', (ev) => {
            const a = (ev.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!a?.closest('aside.sidebar, .mobile-bottom-nav')) return;
            w.__conteudoAntes = document.querySelector('.main-content');
            w.__espera = {
                destino: new URL(a.href).pathname,
                inicio: performance.now(),
                duracaoMs: 0,
                quadros: 0,
                quadrosComEsqueleto: 0,
                quadrosSemConteudo: 0,
                falhas: {},
            };
        }, true);

        new MutationObserver(() => {
            if (!w.__menu || !w.__menu.isConnected) w.__saiu = true;
        }).observe(document.body, { childList: true, subtree: true });

        const quadro = () => {
            const e = w.__espera;
            if (e) {
                // `.main-content` e não `main`: é a classe que toda tela tem — antes do #84, o
                // Perfil a punha num `div`. VISÍVEL: com o esqueleto na tela, a tela anterior
                // continua no DOM, escondida pelo Suspense (altura 0) — e pode nem ser mais o
                // elemento guardado no clique (o Dashboard troca o próprio `main`). Sem isto a
                // janela fechava em 30 ms com a tela ANTERIOR (medido no build de produção).
                const chegou = [...document.querySelectorAll('.main-content:not([aria-busy])')]
                    .some(c => c !== w.__conteudoAntes && visivel(c));
                if (location.pathname === e.destino && chegou) {
                    e.duracaoMs = Math.round(performance.now() - e.inicio);
                    w.__esperas.push(e);
                    w.__espera = null;
                } else {
                    e.quadros++;
                    const esqueleto = document.querySelector('main[aria-busy="true"]');
                    if (esqueleto && visivel(esqueleto)) e.quadrosComEsqueleto++;
                    if (![...document.querySelectorAll('main, .main-content')].some(visivel)) e.quadrosSemConteudo++;
                    for (const sel of sels) {
                        const motivo = motivoSemMenu(sel);
                        if (motivo) e.falhas[motivo] = (e.falhas[motivo] ?? 0) + 1;
                    }
                }
            }
            requestAnimationFrame(quadro);
        };
        requestAnimationFrame(quadro);
    }, seletores);
}

const estado = (page: Page, seletor: string) => page.evaluate((sel) => {
    const w = window as unknown as Janela;
    return {
        mesmoElemento: document.querySelector(sel) === w.__menu,
        saiu: w.__saiu,
        esperas: w.__esperas,
    };
}, seletor);

/** Clica no item do menu que leva a `destino`, pela superfície do aparelho. */
async function irPara(page: Page, destino: { href: string; conta?: true }, celular: boolean) {
    if (celular) {
        const naBarra = page.locator(`.mobile-bottom-nav a[href="${destino.href}"]`);
        if (await naBarra.count()) {
            await naBarra.click();
            return;
        }
        await page.getByRole('button', { name: 'Abrir menu completo' }).click();
        await expect(page.locator('aside.sidebar.open')).toBeVisible();
    }
    const menu = page.locator('aside.sidebar');
    if (destino.conta) {
        // O menu do usuário fica aberto de uma tela para a outra: o menu não remonta.
        if (!(await menu.locator('.sidebar-user-menu').isVisible())) {
            await menu.locator('.user-profile-compact').click();
        }
        await menu.locator(`.sidebar-user-menu a[href="${destino.href}"]`).click();
        return;
    }
    await menu.locator(`.sidebar-nav a[href="${destino.href}"]`).click();
}

function anotar(testInfo: TestInfo, esperas: Espera[]) {
    testInfo.annotations.push({
        type: 'espera por tela',
        description: esperas
            .map(e => `${e.destino}: ${e.duracaoMs} ms, ${e.quadros} quadros `
                + `(${e.quadrosComEsqueleto} com esqueleto, ${e.quadrosSemConteudo} sem conteúdo)`)
            .join(' · '),
    });
}

test.describe('TASK-125 — o menu não sai na navegação (ADR-027 · ADR-029)', () => {
    test('as nove telas do ADMIN: em cada quadro da espera o menu fica, é o mesmo elemento, e a tela anterior continua', async ({ page }, testInfo) => {
        // Nove navegações, cada uma segurada — e, em `next dev`, a primeira visita a cada tela
        // ainda compila a rota.
        test.setTimeout(240_000);
        const celular = testInfo.project.name === 'mobile';
        const partesDoMenu = celular ? ['.mobile-topbar', '.mobile-bottom-nav'] : ['aside.sidebar'];

        await login(page, 'e2e_admin');
        for (const sel of partesDoMenu) await expect(page.locator(sel)).toBeVisible();
        // O indicador do `next dev` (canto inferior esquerdo) fica em cima da barra inferior do
        // celular e intercepta o clique no primeiro item. Só existe em desenvolvimento.
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });

        await observarMenu(page, partesDoMenu);

        const banco = new Client({ connectionString: E2E_DATABASE_URL });
        await banco.connect();
        try {
            for (const [i, destino] of PERCURSO.entries()) {
                const tela = destino.href;
                const soltar = await segurarPaginas(banco);
                try {
                    await irPara(page, destino, celular);
                    await new Promise(r => setTimeout(r, SEGURAR_MS));
                } finally {
                    await soltar();
                }
                await expect(page).toHaveURL(tela);
                // A janela fecha quando a tela nova está no DOM; só então se confere.
                await expect.poll(async () => (await estado(page, partesDoMenu[0])).esperas.length,
                    { message: `a espera de ${tela} não fechou` }).toBe(i + 1);
                await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);

                const r = await estado(page, partesDoMenu[0]);
                const e = r.esperas[i];
                expect(e.destino, 'a espera registrada é de outra navegação').toBe(tela);
                // Sem espera de verdade, a prova não provou nada: passaria com o menu sumindo.
                expect(e.duracaoMs >= SEGURAR_MS * 0.9 && e.quadros > 0,
                    `${tela} chegou sem esperar a página segurada (${e.duracaoMs} ms, ${e.quadros} quadros) — nada foi observado`).toBe(true);
                expect(Object.entries(e.falhas).map(([motivo, n]) => `${motivo} em ${n} de ${e.quadros} quadros`),
                    `${tela}: quadros da espera sem o menu na tela`).toEqual([]);
                expect(r.saiu, `${tela}: o menu saiu do documento durante a navegação (desmontou)`).toBe(false);
                expect(r.mesmoElemento, `${tela}: o menu é OUTRO elemento — foi remontado`).toBe(true);
                // ADR-029 — enquanto a nova não chega, a tela anterior fica.
                expect(e.quadrosComEsqueleto, `${tela}: esqueleto em ${e.quadrosComEsqueleto} de ${e.quadros} quadros da espera`).toBe(0);
                expect(e.quadrosSemConteudo, `${tela}: conteúdo em branco em ${e.quadrosSemConteudo} de ${e.quadros} quadros da espera`).toBe(0);
            }
        } finally {
            await banco.end();
            // Também quando reprova: os números da espera são o que explica a reprovação.
            if (!page.isClosed()) anotar(testInfo, (await estado(page, partesDoMenu[0]).catch(() => null))?.esperas ?? []);
        }
    });
});

test.describe('TASK-125 — o HTML do servidor já mostra o menu (navegação completa)', () => {
    // Sem JavaScript, nada hidrata e nada roda no cliente: o que aparece é o HTML que o
    // servidor mandou — o que o navegador pinta num recarregar, antes de qualquer script.
    // "Estar no HTML" não basta: antes do #84 o menu estava lá, mas dentro do pedaço que o
    // streaming só revela com JavaScript — na tela, o esqueleto sem menu. Por isso VISÍVEL.
    test.use({ javaScriptEnabled: false });

    test('cada tela do ADMIN, aberta direto, chega com o menu visível e com o item dela marcado', async ({ page }, testInfo) => {
        test.setTimeout(180_000);
        const celular = testInfo.project.name === 'mobile';

        // O formulário de login precisa de JavaScript; a API não.
        const res = await page.request.post('/api/auth/login', {
            data: { username: 'e2e_admin', password: E2E_PASSWORD },
        });
        expect(res.ok(), `login pela API: ${res.status()}`).toBe(true);

        for (const { href, conta } of PERCURSO) {
            await page.goto(href);
            await expect(page, `${href} redirecionou`).toHaveURL(href);
            const partes = celular ? ['.mobile-topbar', '.mobile-bottom-nav'] : ['aside.sidebar'];
            for (const sel of partes) {
                await expect(page.locator(sel), `${href}: ${sel} não está visível no HTML do servidor`).toBeVisible();
            }
            // Desenhado PARA esta tela, não uma moldura genérica: o item dela vem marcado. As
            // telas da conta moram no menu do usuário, que abre por clique — sem JS, fechado.
            if (!conta) {
                await expect(page.locator(`aside.sidebar .sidebar-nav a[href="${href}"]`)).toHaveAttribute('aria-current', 'page');
            }
        }
    });
});
