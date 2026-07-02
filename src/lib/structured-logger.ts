import fs from 'fs';
import path from 'path';

// TASK-033 (constitution §7) — logger estruturado: JSON por linha, severidades,
// máscara de dados sensíveis e persistência em arquivo com rotação diária.
// A trilha de auditoria no banco (action_logs, REQ-010) permanece em logger.ts;
// este módulo é o canal operacional/observabilidade — inclusive para eventos que
// precisam sobreviver a limpezas do banco (REQ-014).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEY = /pass(word)?|senha|hash|token|secret|cookie|authorization/i;
const MASK = '***';

// Alvo p95 do spec §6 — acima disso o timing sobe para warn
const SLOW_ROUTE_MS = 500;

function logDir(): string {
    return path.resolve(process.cwd(), process.env.LOG_DIR || 'logs');
}

/** Rotação diária: um arquivo por dia (app-YYYY-MM-DD.log). */
export function currentLogFilePath(): string {
    const day = new Date().toISOString().slice(0, 10);
    return path.join(logDir(), `app-${day}.log`);
}

/** Retorna cópia com valores de chaves sensíveis mascarados, em qualquer profundidade. */
export function maskSensitive(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(maskSensitive);
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            out[key] = SENSITIVE_KEY.test(key) ? MASK : maskSensitive(val);
        }
        return out;
    }
    return value;
}

export function logStructured(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const entry = {
        ts: new Date().toISOString(),
        level,
        msg: message,
        ...(context ? (maskSensitive(context) as Record<string, unknown>) : {}),
    };
    const line = JSON.stringify(entry);

    try {
        fs.mkdirSync(logDir(), { recursive: true });
        fs.appendFileSync(currentLogFilePath(), line + '\n', 'utf-8');
    } catch (e) {
        // Falha de disco não pode derrubar a aplicação — degrada para console
        console.error('[structured-logger] falha ao persistir log:', e);
    }

    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
}

/** Tempo de resposta de rotas críticas (login, withdraw, confirm, return). */
export function logTiming(route: string, durationMs: number, context?: Record<string, unknown>) {
    const level: LogLevel = durationMs > SLOW_ROUTE_MS ? 'warn' : 'info';
    logStructured(level, 'route_timing', {
        type: 'timing',
        route,
        duration_ms: Math.round(durationMs),
        ...context,
    });
}
