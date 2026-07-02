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
// Limite: 5 tentativas falhas em 15 minutos
const LOCKOUT_MAX_ATTEMPTS = 5;
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

export function recordLoginAttempt(username: string, ip: string, success: boolean) {
    ensureLoginAttemptsTable();
    db.prepare('INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, ?)').run(
        username,
        ip,
        success ? 1 : 0
    );
}

export function checkLockout(username: string, ip: string): boolean {
    ensureLoginAttemptsTable();
    // Check failed attempts for this username OR this IP in the last 15 minutes
    const stmt = db.prepare(`
        SELECT COUNT(*) as failures 
        FROM login_attempts 
        WHERE (username = ? OR ip = ?) 
          AND success = 0 
          AND timestamp > datetime('now', '-${LOCKOUT_WINDOW_MINUTES} minutes')
    `);
    const result = stmt.get(username, ip) as { failures: number };
    
    return result.failures >= LOCKOUT_MAX_ATTEMPTS;
}

export function clearLoginAttempts(username: string, ip: string) {
    ensureLoginAttemptsTable();
    db.prepare('DELETE FROM login_attempts WHERE username = ? OR ip = ?').run(username, ip);
}
