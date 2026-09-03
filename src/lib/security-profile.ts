import db from './db';

// PERFIL DE AMBIENTE (constitution §8)
// TASK-060 (Sprint 19) — §8 determina um perfil único dirigido por APP_ENV, do
// qual todo controle lê: "nunca checa ambiente por conta própria". A cláusula
// existia desde a Fase 6 mas nunca foi implementada — não havia uma única
// ocorrência de APP_ENV no projeto e os controles usavam constantes fixas.
//
// O default é `production`: ausência ou erro de configuração nunca pode relaxar
// um controle de segurança. Só o literal exato 'dev' seleciona o perfil frouxo.
export type AppEnv = 'dev' | 'production';

export function appEnv(): AppEnv {
    return process.env.APP_ENV === 'dev' ? 'dev' : 'production';
}

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

export function ensureRateLimitTable() {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS rate_limit_hits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope TEXT NOT NULL,
                identifier TEXT NOT NULL,
                hit_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_lookup
                ON rate_limit_hits (scope, identifier, hit_at);
        `);
    } catch (error) {
        console.error('Error ensuring rate_limit_hits table:', error);
    }
}

/**
 * Consome uma unidade da cota de `identifier` no `scope`. Retorna false quando a
 * cota da janela já se esgotou — nesse caso nada é gravado, para que um cliente
 * já bloqueado não consiga estender o próprio bloqueio indefinidamente.
 *
 * `hit_at` é epoch em milissegundos (INTEGER): comparação por faixa sem depender
 * de formato de data ou de função específica do dialeto, o que mantém o mesmo
 * código válido em SQLite e Postgres.
 */
export function checkRateLimit(identifier: string, scope = 'login'): boolean {
    // §8: desligado em dev. Nunca em production.
    if (controlesRelaxados()) return true;

    ensureRateLimitTable();

    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;

    // Poda global: mantém a tabela pequena sem precisar de job dedicado.
    db.prepare('DELETE FROM rate_limit_hits WHERE hit_at < ?').run(cutoff);

    const { hits } = db.prepare(
        'SELECT COUNT(*) as hits FROM rate_limit_hits WHERE scope = ? AND identifier = ? AND hit_at >= ?'
    ).get(scope, identifier, cutoff) as { hits: number };

    if (hits >= RATE_LIMIT_MAX) return false;

    db.prepare('INSERT INTO rate_limit_hits (scope, identifier, hit_at) VALUES (?, ?, ?)')
        .run(scope, identifier, now);
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

export function ensureLoginAttemptsTable() {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                ip TEXT,
                success INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (error) {
        console.error('Error ensuring login_attempts table:', error);
    }
}

/** Início da janela de lockout, em ISO UTC — mesmo formato gravado por recordLoginAttempt. */
function windowStartIso(): string {
    return new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000).toISOString();
}

export function recordLoginAttempt(username: string, ip: string, success: boolean) {
    ensureLoginAttemptsTable();
    // Timestamp explícito em ISO UTC (e não o CURRENT_TIMESTAMP do SQLite): mesmo
    // formato do resto das tabelas e comparável por faixa sem função de dialeto.
    db.prepare('INSERT INTO login_attempts (username, ip, success, timestamp) VALUES (?, ?, ?, ?)').run(
        username,
        ip,
        success ? 1 : 0,
        new Date().toISOString()
    );
}

function countFailures(column: 'username' | 'ip', value: string): number {
    const row = db.prepare(`
        SELECT COUNT(*) as failures
        FROM login_attempts
        WHERE ${column} = ?
          AND success = 0
          AND timestamp > ?
    `).get(value, windowStartIso()) as { failures: number };
    return row.failures;
}

/**
 * Bloqueio temporário. Retorna true se a CONTA excedeu o limite de falhas, ou se
 * o IP apresenta volume anômalo de falhas (força bruta distribuída) — este último
 * com limiar alto o bastante para não penalizar uma rede compartilhada legítima.
 */
export function checkLockout(username: string | undefined | null, ip: string): boolean {
    // §8: desligado em dev. O registro das tentativas continua sendo gravado —
    // relaxar o controle não apaga trilha de auditoria (REQ-010).
    if (controlesRelaxados()) return false;

    ensureLoginAttemptsTable();

    if (username && countFailures('username', username) >= LOCKOUT_MAX_ATTEMPTS) {
        return true;
    }

    return countFailures('ip', ip) >= IP_LOCKOUT_MAX_ATTEMPTS;
}

/**
 * Limpa as tentativas falhas da CONTA após login bem-sucedido.
 * TASK-053: não apaga por IP — em rede compartilhada isso zeraria o contador de
 * outras contas sob ataque sempre que qualquer pessoa do campus logasse.
 * A auditoria permanece integral em action_logs (REQ-010).
 */
export function clearLoginAttempts(username: string) {
    db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username);
}
