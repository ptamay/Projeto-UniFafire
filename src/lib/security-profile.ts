import db from './db';

// RATE LIMITER (In-Memory para servidor PM2 local)
// Limite: 30 requests por minuto por IP
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();

export function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    let record = rateLimitMap.get(ip);

    if (!record || now > record.expiresAt) {
        record = { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_MS };
        rateLimitMap.set(ip, record);
        return true;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        return false;
    }

    record.count++;
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
const LOCKOUT_WINDOW_MINUTES = 15;

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
