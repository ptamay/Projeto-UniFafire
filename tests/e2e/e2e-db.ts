import { TEST_DATABASE_URL } from '../pg-test-config';

// TASK-118 — endereço da base e do servidor da suíte E2E, em um lugar só.
//
// O `playwright.config.ts` precisa da URL ao montar o `webServer`, e o `globalSetup`
// precisa dela para montar a base. Duas cópias divergiriam — e a divergência seria
// silenciosa: o servidor olhando uma base e o seed preenchendo outra.
//
// ## Por que uma base própria, e não a da vitest
//
// A vitest faz TRUNCATE e ressemeia `unifafire_test` a cada arquivo. Rodando as duas
// suítes na mesma base, os usuários `e2e_*` somem no meio de um fluxo, e o sintoma é
// um 401 que parece defeito de autenticação. Mesmo servidor Postgres (o container de
// `npm run test:db:up`), outra base.
//
// ## Por que uma porta própria
//
// O `webServer` NÃO reaproveita servidor já no ar (`reuseExistingServer: false`), e
// deve ser assim: um `npm run dev` comum na 3000 aponta para o `.env.local`, não para
// esta base. Na 3000, a suíte não roda enquanto houver um dev server aberto — nesta
// máquina há quase sempre um. A 3100 fica fora do caminho, e `E2E_PORT` sobrescreve.

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

const E2E_DATABASE_NAME = 'unifafire_e2e';

/** O `globalSetup` derruba o schema `public` da base que recebe: ela tem de ser local
 *  e não pode ser a da vitest. Recusa ANTES de conectar — a recusa não pode depender
 *  de a conexão falhar. */
export function validarBaseE2E(url: string): void {
    const alvo = new URL(url);
    const host = alvo.hostname.replace(/^\[|\]$/g, '');
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
        throw new Error(`base E2E recusada: ${host} não é local — o globalSetup apaga o schema public da base que recebe`);
    }
    if (alvo.pathname === new URL(TEST_DATABASE_URL).pathname) {
        throw new Error(`base E2E recusada: ${alvo.pathname.slice(1)} é a base da vitest, que ressemeia a cada arquivo`);
    }
}

function urlDaBaseE2E(): string {
    if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
    // Mesmo servidor e credenciais da vitest — inclusive a `DATABASE_URL` que
    // `tests/pg-test-config.ts` honra para contornar porta ocupada —, outra base.
    const url = new URL(TEST_DATABASE_URL);
    url.pathname = `/${E2E_DATABASE_NAME}`;
    return url.toString();
}

export const E2E_DATABASE_URL = urlDaBaseE2E();
validarBaseE2E(E2E_DATABASE_URL);
