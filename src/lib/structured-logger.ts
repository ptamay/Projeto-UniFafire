import { execute } from '@/lib/pg';

// TASK-033 (constitution §7) — logger estruturado: severidades, máscara de dados
// sensíveis e persistência durável.
//
// A trilha de auditoria no banco (`action_logs`, REQ-010) permanece em
// `logger.ts`; este módulo é o canal operacional/observabilidade — inclusive
// para eventos que precisam sobreviver a limpezas do banco (REQ-014).
//
// ## TASK-074 (Sprint 22): o destino deixou de ser arquivo
//
// Até aqui a persistência era `fs.appendFileSync` em `logs/`, com rotação
// diária. No Vercel o filesystem é efêmero e somente-leitura: a escrita falharia,
// cairia no `catch` que já existia, degradaria para `console` e a aplicação
// seguiria saudável — com a trilha evaporando a cada invocação, sem alarme.
//
// A §7 já registrava isso ("arquivo em `logs/` não serve à hospedagem
// serverless… a trilha se perderia") e o critério de aceite (d) do REQ-031
// nomeia o log estruturado ao lado de `history` e `action_logs`. Por isso a
// TASK-074 subiu da Etapa 6 para a 7a: não é melhoria, é pré-requisito.
//
// ## Por que a função virou assíncrona
//
// Escrever no Postgres é assíncrono, e disparar sem esperar (`void logStructured`)
// recriaria o problema numa forma nova: em execução serverless a instância pode
// congelar assim que a resposta sai, e a escrita pendente morre com ela. O
// REQ-031(d) pede a trilha "sem perda" — então quem loga espera. Os cinco
// chamadores já estavam em contexto assíncrono.
//
// A degradação para `console` continua, e agora ela é o que ela deveria sempre
// ter sido: um sinal de que a persistência falhou, não o lugar onde a trilha
// mora. `console` nunca chama de volta o logger — recursão numa falha de
// escrita seria um laço infinito exatamente quando o banco está ruim.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEY = /pass(word)?|senha|hash|token|secret|cookie|authorization/i;
const MASK = '***';

// Alvo p95 do spec §6 — acima disso o timing sobe para warn
const SLOW_ROUTE_MS = 500;

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

export async function logStructured(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
): Promise<void> {
    const seguro = context
        ? (maskSensitive(context) as Record<string, unknown>)
        : null;

    // A máscara roda ANTES de qualquer saída — inclusive antes do console, que
    // em produção vai para o coletor da hospedagem e é tão público quanto a
    // tabela (constitution §6.1).
    const eco = JSON.stringify({ ts: new Date().toISOString(), level, msg: message, ...(seguro ?? {}) });

    try {
        await execute(
            'INSERT INTO app_logs (level, message, context) VALUES ($1, $2, $3)',
            [level, message, seguro ? JSON.stringify(seguro) : null],
        );
    } catch (e) {
        // Persistência é o objetivo, não a condição: uma requisição não pode cair
        // porque o log falhou. Mas também não pode falhar em silêncio — foi o
        // silêncio, e não a falha, que deixou o defeito de `logs/` passar.
        console.error('[structured-logger] falha ao persistir em app_logs:', e);
    }

    if (level === 'error') console.error(eco);
    else if (level === 'warn') console.warn(eco);
    else console.log(eco);
}

/** Tempo de resposta de rotas críticas (login, withdraw, confirm, return). */
export async function logTiming(
    route: string,
    durationMs: number,
    context?: Record<string, unknown>,
): Promise<void> {
    const level: LogLevel = durationMs > SLOW_ROUTE_MS ? 'warn' : 'info';
    await logStructured(level, 'route_timing', {
        type: 'timing',
        route,
        duration_ms: Math.round(durationMs),
        ...context,
    });
}
