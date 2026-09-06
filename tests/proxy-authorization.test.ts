import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { proxy, config as proxyConfig } from '@/proxy';
import { signSession } from '@/lib/session-edge';

// TASK-077 (Sprint 22 · Etapa 7a do ADR-012) — autorização com defesa em
// profundidade no proxy. constitution §3.2.
//
// ## O defeito
//
// O proxy fazia duas coisas: renovava a expiração do cookie e limpava JWT
// inválido. Requisição SEM cookie de sessão caía em `return NextResponse.next()`
// e seguia adiante. A verificação de papel é feita à mão em cada handler — então
// uma rota nova esquecida NASCE ABERTA, e nada avisa.
//
// Débito registrado desde a Sprint 9 como "tolerável em rede local; endereçar
// antes da exposição pública". A exposição pública é a Sprint 23.
//
// ## O limite desta task, que está nos cenários
//
// O proxy roda no EDGE RUNTIME: sem Node APIs, sem `pg`. A única verificação
// possível ali é a do JWT (assinatura + expiração), não a do banco. Isto é
// DEFESA EM PROFUNDIDADE, não substituição: a checagem de papel por rota (§3.2)
// continua sendo a autoridade, e o proxy é a rede que pega o que ela esquecer.
// Há cenário afirmando exatamente isso — para que ninguém leia esta task como
// "agora o proxy autoriza" e pare de checar no handler.

const RAIZ = process.cwd();

function req(caminho: string, token?: string) {
    const headers = new Headers();
    if (token) headers.set('cookie', `session=${token}`);
    return new NextRequest(new URL(`http://localhost${caminho}`), { headers });
}

/** NextResponse.next() marca a resposta com este header. */
function passou(res: Response) {
    return res.headers.has('x-middleware-next');
}

function destinoDoRedirect(res: Response) {
    return res.headers.get('location') ?? '';
}

const tokenValido = () => signSession({ id: 1, username: 'test_admin', role: 'ADMIN' });
const tokenPorteiro = () => signSession({ id: 3, username: 'test_porteiro', role: 'PORTEIRO' });

describe('TASK-077 — requisição sem sessão não passa', () => {
    it('BDD 1: página protegida redireciona para o login', async () => {
        for (const pagina of ['/', '/keys', '/history', '/users', '/settings', '/logs', '/confirm', '/account/profile']) {
            const res = await proxy(req(pagina));
            expect(passou(res), `${pagina} passou sem sessão`).toBe(false);
            expect(res.status, `${pagina} não redirecionou`).toBe(307);
            expect(destinoDoRedirect(res), `${pagina} redirecionou para lugar errado`).toMatch(/\/login$/);
        }
    });

    it('BDD 1: rota de API protegida responde 401, não redirect', async () => {
        // Redirecionar uma chamada de API para uma página HTML faria o cliente
        // receber 200 com HTML no lugar do JSON esperado — e tratar isso como
        // resposta válida. 401 é o que o `fetch` do front sabe interpretar.
        for (const rota of ['/api/keys', '/api/users', '/api/transactions', '/api/settings', '/api/logs']) {
            const res = await proxy(req(rota));
            expect(passou(res), `${rota} passou sem sessão`).toBe(false);
            expect(res.status, `${rota} não respondeu 401`).toBe(401);
            expect(res.headers.get('content-type')).toMatch(/json/);
        }
    });

    it('BDD 4: uma rota NOVA, que ninguém lembrou de proteger, nasce fechada', async () => {
        // O ponto inteiro da task. Nenhum handler existe neste caminho; se o
        // proxy fosse permissivo por padrão, a resposta viria do Next (404) e
        // um handler futuro nasceria aberto no mesmo lugar.
        const res = await proxy(req('/api/rota-que-alguem-esqueceu-de-proteger'));
        expect(res.status, 'rota desconhecida passou sem sessão').toBe(401);
    });
});

describe('TASK-077 — sessão inválida ou expirada não passa', () => {
    it('BDD 2: JWT adulterado é recusado e o cookie é limpo', async () => {
        const bom = await tokenValido();
        const adulterado = bom.slice(0, -4) + 'AAAA';

        const res = await proxy(req('/keys', adulterado));
        expect(passou(res), 'token adulterado passou').toBe(false);
        expect(res.status).toBe(307);
        expect(
            res.headers.get('set-cookie') ?? '',
            'o cookie inválido não foi limpo — ele voltaria na próxima requisição',
        ).toMatch(/session=;|session=""|Max-Age=0/);
    });

    it('BDD 2: token assinado com outro segredo é recusado', async () => {
        // Formato válido, assinatura de outra chave. É o caso que uma
        // verificação superficial ("tem três partes separadas por ponto?")
        // deixaria passar.
        const outro = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwicm9sZSI6IkFETUlOIn0.assinatura_de_outra_chave';
        const res = await proxy(req('/api/users', outro));
        expect(res.status).toBe(401);
    });
});

describe('TASK-077 — a lista de rotas públicas é explícita e mínima (BDD 3)', () => {
    it('o login e as rotas de autenticação passam sem sessão', async () => {
        for (const rota of ['/login', '/api/auth/login', '/api/auth/logout']) {
            const res = await proxy(req(rota));
            expect(passou(res), `${rota} foi bloqueada — ninguém consegue entrar`).toBe(true);
        }
    });

    it('os arquivos que o PWA e o navegador buscam sem sessão passam', async () => {
        // Armadilha real: os arquivos de `public/` são servidos na RAIZ, não sob
        // `/public/`. O matcher que excluía "public" nunca os excluiu de fato —
        // passava despercebido enquanto o proxy deixava tudo passar. Com negação
        // por padrão, um `sw.js` respondendo 307 quebra a instalação do PWA, e um
        // `manifest.json` redirecionado tira o app da tela inicial.
        for (const arquivo of [
            '/manifest.json', '/sw.js', '/workbox-4754cb34.js', '/favicon.ico',
            '/logo/unifafire_logo.png',
            // Fonte: a página de login precisa de tipografia antes de existir
            // sessão. Hoje o Next serve `__nextjs_font` antes do proxy, mas uma
            // fonte auto-hospedada em `public/` cairia na negação por padrão.
            '/fonts/geist-latin.woff2', '/fonts/inter.ttf',
        ]) {
            const res = await proxy(req(arquivo));
            expect(passou(res), `${arquivo} bloqueado — quebraria o PWA, o ícone ou a fonte do login`).toBe(true);
        }
    });

    it('a lista pública NÃO inclui nada além do necessário', async () => {
        // Rotas que já foram "de autenticação" em algum momento do desenho mas
        // exigem sessão por definição.
        const res = await proxy(req('/api/auth/me'));
        expect(res.status, '/api/auth/me passou sem sessão — ela devolve dados da sessão').toBe(401);
    });

    it('o matcher deixa TODO o namespace interno do Next de fora', () => {
        // Este teste existe porque a primeira versão da task não o tinha, e o
        // defeito passou: o matcher excluía só `_next/static` e `_next/image`,
        // então `/_next/hmr` caiu na negação por padrão e respondeu 307. O
        // WebSocket do hot reload parou de conectar, e a suíte ficou verde — o
        // matcher é CONFIG ESTÁTICA que a função `proxy` nunca enxerga, então
        // testar só a função deixa este portão inteiro sem cobertura.
        const [padrao] = proxyConfig.matcher;
        const re = new RegExp(`^${padrao}$`);

        for (const interno of [
            '/_next/hmr',
            '/_next/webpack-hmr',
            '/_next/static/chunks/main.js',
            '/_next/image',
            '/_next/qualquer-coisa-que-o-next-invente-depois',
        ]) {
            expect(re.test(interno), `${interno} entrou no proxy e seria negado`).toBe(false);
        }
    });

    it('o matcher NÃO deixa rota de aplicação de fora', () => {
        const [padrao] = proxyConfig.matcher;
        const re = new RegExp(`^${padrao}$`);

        for (const rota of ['/', '/keys', '/api/users', '/manifest.json', '/api/rota-nova']) {
            expect(re.test(rota), `${rota} escapou do proxy pelo matcher`).toBe(true);
        }
    });

    it('a lista é declarada como constante, não espalhada em ifs', () => {
        const fonte = fs.readFileSync(path.resolve(RAIZ, 'src/proxy.ts'), 'utf-8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
        expect(fonte, 'as rotas públicas precisam ser uma lista legível de um lugar só')
            .toMatch(/ROTAS_PUBLICAS|CAMINHOS_PUBLICOS/);
    });
});

describe('TASK-077 — sessão válida passa e o cookie é renovado', () => {
    it('BDD 6: os caminhos dos quatro fluxos críticos seguem abertos para quem tem sessão', async () => {
        const token = await tokenValido();
        for (const caminho of [
            '/', '/keys', '/history', '/confirm',
            '/api/keys', '/api/transactions', '/api/transactions/pending',
            '/api/transactions/9/user-confirm', '/api/transactions/9/cancel',
        ]) {
            const res = await proxy(req(caminho, token));
            expect(passou(res), `${caminho} bloqueado para sessão VÁLIDA`).toBe(true);
        }
    });

    it('o idle de 24 h continua sendo renovado a cada requisição válida', async () => {
        const res = await proxy(req('/keys', await tokenValido()));
        const cookie = res.headers.get('set-cookie') ?? '';
        expect(cookie, 'o cookie não foi renovado — a sessão expiraria em 24 h fixas').toMatch(/Max-Age=86400/);
        expect(cookie).toMatch(/HttpOnly/);
    });
});

describe('TASK-077 — o proxy NÃO é quem autoriza papel (§3.2 continua a autoridade)', () => {
    it('BDD 5: sessão de papel insuficiente PASSA pelo proxy — quem recusa é o handler', async () => {
        // Se o proxy decidisse papel, teríamos dois lugares para acertar em vez
        // de um, e a divergência entre eles seria invisível até virar incidente.
        // Ele garante que HÁ sessão; o handler garante que a sessão PODE.
        const res = await proxy(req('/api/users', await tokenPorteiro()));
        expect(
            passou(res),
            'o proxy passou a autorizar papel — a regra agora vive em dois lugares',
        ).toBe(true);
    });

    it('BDD 5: o proxy não conhece a matriz de permissões', () => {
        const fonte = fs.readFileSync(path.resolve(RAIZ, 'src/proxy.ts'), 'utf-8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
        expect(fonte, 'o proxy importou a matriz de RBAC').not.toMatch(/ROLE_PERMISSIONS|canManageUsers|canViewLogs/);
    });

    it('o proxy continua Edge-safe: nada de banco nem de Node API', () => {
        const fonte = fs.readFileSync(path.resolve(RAIZ, 'src/proxy.ts'), 'utf-8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
        expect(fonte, 'importou @/lib/pg — o Edge Runtime não tem o driver').not.toMatch(/@\/lib\/pg|from ['"]pg['"]/);
        expect(fonte, 'importou verifySession do Node em vez da versão Edge').not.toMatch(/@\/lib\/session['"]/);
        expect(fonte, 'importou fs').not.toMatch(/from ['"](node:)?fs['"]/);
    });
});
