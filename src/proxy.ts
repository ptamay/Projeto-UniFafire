import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionEdge } from '@/lib/session-edge';
import { opcoesCookieSessao, NOME_COOKIE_SESSAO } from '@/lib/session-cookie';

// Renomeado de middleware.ts para proxy.ts na Sprint 9 (convenção depreciada do
// Next 16 — https://nextjs.org/docs/messages/middleware-to-proxy).
//
// TASK-077 (Sprint 22 · Etapa 7a do ADR-012) — autorização com defesa em
// profundidade. constitution §3.2.
//
// ## O que era
//
// O proxy só renovava a expiração do cookie e limpava JWT inválido. Requisição
// SEM cookie caía em `return NextResponse.next()` e seguia adiante. Como a
// verificação de papel é feita à mão em cada handler, uma rota nova que alguém
// esquecesse de proteger NASCIA ABERTA — e nada avisava. Tolerável numa
// intranet, que é onde o sistema esteve; inaceitável a partir da Sprint 23.
//
// ## A inversão que esta task faz
//
// O padrão deixa de ser "passa" e vira "nega". O que passa sem sessão é uma
// LISTA, curta e legível de um lugar só. Rota nova nasce protegida por omissão,
// que é a propriedade que se quer: o esquecimento passa a falhar fechado.
//
// ## O que este proxy NÃO faz, e por quê
//
// Ele não autoriza PAPEL. Roda no Edge Runtime — sem Node APIs, sem `pg` —, e a
// única verificação possível aqui é a do JWT: assinatura e expiração. Confirmar
// que o usuário existe, está ativo e não trocou de senha exige o banco, e isso
// vive em `verifySession` (§2.7, logout everywhere).
//
// Mesmo se desse, não deveria: a fonte única de autorização é `ROLE_PERMISSIONS`
// (§3.1), checada em cada handler (§3.2). Duplicar a decisão aqui criaria dois
// lugares para acertar, e a divergência entre eles seria invisível até virar
// incidente. Este é o piso — HÁ sessão —, e o handler é o teto — a sessão PODE.

/**
 * Tudo que responde sem sessão. Curto de propósito: cada entrada aqui é uma
 * porta, e portas se contam.
 */
const ROTAS_PUBLICAS = new Set([
    '/login',
    '/api/auth/login',
    // Sair não pode exigir estar dentro: um cookie corrompido deixaria o usuário
    // preso sem conseguir limpá-lo.
    '/api/auth/logout',
]);

/**
 * Arquivos servidos na RAIZ que o navegador e o PWA buscam antes de qualquer
 * sessão existir.
 *
 * ⚠️ Os arquivos de `public/` são servidos na raiz, NÃO sob `/public/`. O
 * matcher antigo excluía "public" e portanto nunca excluiu nada — passava
 * despercebido porque o proxy deixava tudo passar. Com negação por padrão isso
 * vira defeito visível: `sw.js` com 307 quebra a instalação do PWA e
 * `manifest.json` redirecionado tira o app da tela inicial.
 */
const ARQUIVOS_PUBLICOS =
    /^\/(manifest\.json|sw\.js|workbox-[\w.-]+\.js|favicon\.ico|robots\.txt|.*\.(png|jpe?g|svg|gif|webp|ico|webmanifest|woff2?|ttf|otf))$/i;

// As fontes entram por seguro, não por necessidade observada: hoje o Next serve
// `/__nextjs_font/...` antes do proxy, e o `/login` carrega normalmente sem
// sessão. Mas isso é comportamento interno não documentado, e uma fonte
// auto-hospedada em `public/` cairia na negação por padrão — deixando a página
// de login sem tipografia justamente para quem ainda não entrou.

function ehPublico(caminho: string): boolean {
    return ROTAS_PUBLICAS.has(caminho) || ARQUIVOS_PUBLICOS.test(caminho);
}

/** API recebe 401; página recebe redirect. Devolver HTML de login a um `fetch`
 *  faria o cliente ler 200 com HTML no lugar do JSON e tratar como sucesso —
 *  falha que aparece longe da causa. */
function recusar(request: NextRequest, limparCookie: boolean): NextResponse {
    const ehApi = request.nextUrl.pathname.startsWith('/api/');

    const response = ehApi
        ? NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.nextUrl.origin));

    // Cookie inválido tem de sair agora; senão volta na próxima requisição e o
    // usuário fica num laço de recusa sem entender por quê.
    if (limparCookie) response.cookies.delete(NOME_COOKIE_SESSAO);

    return response;
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (ehPublico(pathname)) return NextResponse.next();

    const sessionCookie = request.cookies.get(NOME_COOKIE_SESSAO);
    if (!sessionCookie?.value) return recusar(request, false);

    const payload = await verifySessionEdge(sessionCookie.value);
    if (!payload) return recusar(request, true);

    // Sessão criptograficamente válida. Renova o idle de 24 h — a expiração
    // ABSOLUTA de 7 dias vive dentro do próprio JWT e não é estendida aqui.
    const response = NextResponse.next();
    response.cookies.set(opcoesCookieSessao(sessionCookie.value));
    return response;
}

/**
 * Prefixos internos do Next, fora do proxy. Exportado para que o teste afirme
 * sobre a mesma constante que o matcher usa — o `matcher` é config estática que
 * a função `proxy` nunca enxerga, então testar só a função deixa este portão
 * inteiro sem cobertura.
 *
 * ⚠️ É `_next/` inteiro, não `_next/static` e `_next/image` como a primeira
 * versão desta task escreveu. Aquilo quebrou o hot reload: `/_next/hmr` passou a
 * responder 307 para o login e o WebSocket do dev server parou de conectar.
 * Nenhum teste pegou, porque o defeito estava no matcher e não no código.
 *
 * Excluir `_next/` inteiro é seguro no App Router: os assets de build são
 * públicos por natureza, o otimizador de imagem é restrito pela própria config
 * do Next, e o payload RSC de uma página é servido NO CAMINHO DA PÁGINA (com
 * `?_rsc=`), não sob `/_next/` — ou seja, continua passando por aqui.
 */
export const PREFIXO_INTERNO_NEXT = '_next/';

export const config = {
    // Tudo que não for interno do Next entra — inclusive os arquivos de
    // `public/`, que são servidos na raiz. Quem decide é `ehPublico`, onde a
    // regra é legível e testada, em vez de escondida numa negative lookahead.
    matcher: ['/((?!_next/).*)'],
};
