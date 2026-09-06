import { queryOne, execute } from './pg';
import { appEnv } from './app-env';

// PERFIL DE AMBIENTE (constitution §8)
// TASK-060 (Sprint 19) — §8 determina um perfil único dirigido por APP_ENV, do
// qual todo controle lê: "nunca checa ambiente por conta própria". A cláusula
// existia desde a Fase 6 mas nunca foi implementada — não havia uma única
// ocorrência de APP_ENV no projeto e os controles usavam constantes fixas.
//
// O default é `production`: ausência ou erro de configuração nunca pode relaxar
// um controle de segurança. Só o literal exato 'dev' seleciona o perfil frouxo.
// TASK-076: a definicao saiu para `app-env.ts`, sem dependencia nenhuma, porque
// o `proxy.ts` roda no Edge Runtime e este modulo importa `./pg`. Re-exportado
// aqui para nao quebrar quem ja importava daqui.
export type { AppEnv } from './app-env';
export { appEnv };

/** §8 — relaxável apenas em dev: lockout e rate limit. */
function controlesRelaxados(): boolean {
    return appEnv() === 'dev';
}

// RATE LIMITER (persistente em banco)
// TASK-054 (Sprint 16) — o contador vivia num Map do processo. Sob PM2, com uma
// instância única e longeva, isso funcionava; em serverless cada invocação pode
// cair numa instância diferente e o Map zera a cada cold start, de modo que o
// limite efetivo vira "30 × número de lambdas ativas" e reseta sem previsão.
// O estado passa a viver no banco, único ponto compartilhado por todas as
// instâncias. Janela deslizante de 1 minuto por (escopo, identificador).
export const RATE_LIMIT_MAX = 30;
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// ensureRateLimitTable foi removida: o schema passa a vir das migrations em
// db/migrations-pg/, aplicadas antes da aplicacao subir. Criar tabela em
// runtime escondia divergencia de schema — a tabela nascia com a forma que
// o codigo supunha, mesmo quando a migration dizia outra coisa.

/**
 * Consome uma unidade da cota de `identifier` no `scope`. Retorna false quando a
 * cota da janela já se esgotou — nesse caso nada é gravado, para que um cliente
 * já bloqueado não consiga estender o próprio bloqueio indefinidamente.
 *
 * `hit_at` é epoch em milissegundos (INTEGER): comparação por faixa sem depender
 * de formato de data ou de função específica do dialeto, o que mantém o mesmo
 * código válido em SQLite e Postgres.
 */
export async function checkRateLimit(identifier: string, scope = 'login'): Promise<boolean> {
    // §8: desligado em dev. Nunca em production.
    if (controlesRelaxados()) return true;


    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;

    // Poda global: mantém a tabela pequena sem precisar de job dedicado.
    await execute('DELETE FROM rate_limit_hits WHERE hit_at < $1', [cutoff]);

    // count(*) volta como string no Postgres (bigint não cabe em number sem
    // perda); converter explicitamente evita a comparação virar string vs número.
    const linha = await queryOne<{ hits: string }>(
        'SELECT COUNT(*) as hits FROM rate_limit_hits WHERE scope = $1 AND identifier = $2 AND hit_at >= $3',
        [scope, identifier, cutoff],
    );
    const hits = Number(linha?.hits ?? 0);

    if (hits >= RATE_LIMIT_MAX) return false;

    await execute('INSERT INTO rate_limit_hits (scope, identifier, hit_at) VALUES ($1, $2, $3)',
        [scope, identifier, now]);
    return true;
}

// ACCOUNT LOCKOUT (SQLite)
// TASK-053 (Sprint 16) — o bloqueio é por CONTA, não por endereço de rede.
// Contar falhas por IP com o mesmo limiar da conta transborda em rede
// institucional: no NAT do campus todos os usuários compartilham um único IP
// público, e cinco erros de senha de uma pessoa trancariam todo mundo por 15
// minutos. O IP mantém um limiar próprio, muito mais alto, apenas para conter
// força bruta distribuída (varredura de vários usernames a partir de um host).
const LOCKOUT_MAX_ATTEMPTS = 5;
export const IP_LOCKOUT_MAX_ATTEMPTS = 50;
export const LOCKOUT_WINDOW_MINUTES = 15;

// ensureLoginAttemptsTable foi removida: o schema passa a vir das migrations em
// db/migrations-pg/, aplicadas antes da aplicacao subir. Criar tabela em
// runtime escondia divergencia de schema — a tabela nascia com a forma que
// o codigo supunha, mesmo quando a migration dizia outra coisa.

/** Início da janela de lockout, em ISO UTC — mesmo formato gravado por recordLoginAttempt. */
function windowStartIso(): string {
    return new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000).toISOString();
}

export async function recordLoginAttempt(username: string, ip: string, success: boolean) {
    // Timestamp explícito em ISO UTC (e não o CURRENT_TIMESTAMP do SQLite): mesmo
    // formato do resto das tabelas e comparável por faixa sem função de dialeto.
    // success passa a boolean: no Postgres a coluna é boolean de verdade
    // (TASK-063), e mandar 0/1 seria erro de tipo.
    await execute(
        'INSERT INTO login_attempts (username, ip, success, timestamp) VALUES ($1, $2, $3, $4)',
        [username, ip, success, new Date().toISOString()],
    );
}

async function countFailures(column: 'username' | 'ip', value: string): Promise<number> {
    // `column` é interpolado, e continua sendo a única exceção que a §1.3 admite:
    // vem de um tipo-união fechado no próprio código, nunca de input. O VALOR vai
    // parametrizado, como todo o resto.
    const row = await queryOne<{ failures: string }>(`
        SELECT COUNT(*) as failures
        FROM login_attempts
        WHERE ${column} = $1
          AND NOT success
          AND timestamp > $2
    `, [value, windowStartIso()]);
    return Number(row?.failures ?? 0);
}

/**
 * Bloqueio temporário. Retorna true se a CONTA excedeu o limite de falhas, ou se
 * o IP apresenta volume anômalo de falhas (força bruta distribuída) — este último
 * com limiar alto o bastante para não penalizar uma rede compartilhada legítima.
 */
export async function checkLockout(username: string | undefined | null, ip: string): Promise<boolean> {
    // §8: desligado em dev. O registro das tentativas continua sendo gravado —
    // relaxar o controle não apaga trilha de auditoria (REQ-010).
    if (controlesRelaxados()) return false;


    if (username && (await countFailures('username', username)) >= LOCKOUT_MAX_ATTEMPTS) {
        return true;
    }

    return (await countFailures('ip', ip)) >= IP_LOCKOUT_MAX_ATTEMPTS;
}

/**
 * Limpa as tentativas falhas da CONTA após login bem-sucedido.
 * TASK-053: não apaga por IP — em rede compartilhada isso zeraria o contador de
 * outras contas sob ataque sempre que qualquer pessoa do campus logasse.
 * A auditoria permanece integral em action_logs (REQ-010).
 */
export async function clearLoginAttempts(username: string) {
    await execute('DELETE FROM login_attempts WHERE username = $1', [username]);
}
