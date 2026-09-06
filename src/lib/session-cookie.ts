import { appEnv } from '@/lib/app-env';

// TASK-076 (Sprint 22 · Etapa 7a do ADR-012) — as opções do cookie de sessão,
// num lugar só. constitution §2.3.
//
// ## O que estava errado
//
// Três lugares emitiam o cookie (`auth/login`, `account/security/password`,
// `proxy`) e os três calculavam:
//
//     const isHttps = request.headers.get('x-forwarded-proto') === 'https'
//                  || request.url.startsWith('https://');
//     ... secure: isHttps
//
// Um atributo de segurança derivado de um header é um atributo que o cliente
// influencia. Pior que um valor fixo errado: um valor fixo errado é visível na
// revisão, este some no meio de uma expressão que parece cuidadosa.
//
// A §2.3 foi reescrita no ADR-012 exatamente sobre isso: "`secure` obrigatório
// em produção — a hospedagem serve exclusivamente por HTTPS, então o condicional
// 'quando servido via HTTPS' deixa de existir".
//
// ## Por que a função não aceita informação de protocolo
//
// A assinatura não recebe `request`, nem header, nem flag de HTTPS. Isso é a
// garantia: não há por onde reintroduzir a derivação sem mudar a assinatura —
// e mudar assinatura aparece na revisão. A única entrada é o perfil de ambiente
// da §8, cujo default é `production`.
//
// Edge-safe de propósito: importa apenas `app-env`, que não importa nada. O
// `proxy.ts` roda no Edge Runtime, onde `pg` não existe.

export const NOME_COOKIE_SESSAO = 'session';

/** Idle de 24 h (constitution §2.2). A expiração ABSOLUTA de 7 dias vive no
 *  JWT, em `session-edge.ts` — são dois limites diferentes, e este é o menor. */
export const MAX_AGE_SESSAO_S = 60 * 60 * 24;

export interface OpcoesCookieSessao {
    name: string;
    value: string;
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    maxAge: number;
}

export function opcoesCookieSessao(token: string): OpcoesCookieSessao {
    return {
        name: NOME_COOKIE_SESSAO,
        value: token,
        httpOnly: true,
        // Incondicional em produção. `appEnv()` só devolve 'dev' para o literal
        // exato — ausente, vazio ou desconhecido cai em produção (§8).
        secure: appEnv() === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: MAX_AGE_SESSAO_S,
    };
}
