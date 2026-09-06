// TASK-055 (Sprint 16) — fuso da aplicação e conversão de filtros locais em
// faixas UTC.
//
// Todo timestamp é gravado em UTC, mas é lido por pessoas em Recife. Os filtros
// de histórico e de logs comparavam o valor cru em UTC contra a hora que o
// operador vê na tela, devolvendo a faixa errada: filtrar "17h" trazia registros
// exibidos às 14h, e movimentações entre 21h e a meia-noite local caíam no dia
// seguinte. Além disso o histórico tem duas formas de timestamp gravadas
// (ISO com Z, e o CURRENT_TIMESTAMP do SQLite sem marcação de fuso) — a segunda
// é UTC, mas o JavaScript a interpreta como hora local e adianta o registro.
//
// As faixas são devolvidas como [início, fim) em ISO UTC, comparáveis por
// desigualdade direta na coluna: além de corretas, permanecem sargáveis, ao
// contrário de strftime()/DATE() aplicados sobre a coluna.

// NEXT_PUBLIC_ é o que chega ao bundle do cliente; a variável sem prefixo
// atende o servidor. Sem nenhuma das duas, Recife — o fuso da instituição.
const configuredTimeZone =
    (typeof process !== 'undefined' &&
        (process.env.NEXT_PUBLIC_APP_TIMEZONE || process.env.APP_TIMEZONE)) || '';

export const APP_TIMEZONE = configuredTimeZone || 'America/Recife';

const ISO_UTC = /Z$|[+-]\d{2}:?\d{2}$/;
const SQLITE_LOCALLESS = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/;

/**
 * Devolve o timestamp em ISO UTC, aceitando as formas que chegam do banco.
 *
 * O driver Postgres entrega `timestamptz` como **Date** — este é o caminho
 * normal desde a Sprint 21. As formas em texto continuam aceitas porque ainda
 * chegam de outras origens: ISO com Z (gravado por `new Date().toISOString()`)
 * e a forma sem fuso do `CURRENT_TIMESTAMP` do SQLite, que é UTC e é anotada
 * como tal em vez de ser reinterpretada como hora local (TASK-055).
 */
export function normalizeTimestamp(raw: string | Date): string {
    if (!raw) return typeof raw === 'string' ? raw : '';
    // Date primeiro: já é um instante, não há o que interpretar.
    if (raw instanceof Date) return raw.toISOString();
    if (ISO_UTC.test(raw)) return new Date(raw).toISOString();

    const m = SQLITE_LOCALLESS.exec(raw.trim());
    if (m) return new Date(`${m[1]}T${m[2]}${m[3] || '.000'}Z`).toISOString();

    return new Date(raw).toISOString();
}

/** Deslocamento do fuso em minutos para o instante dado (positivo = à frente de UTC). */
function offsetMinutes(instant: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(instant);

    const at: Record<string, number> = {};
    for (const p of parts) if (p.type !== 'literal') at[p.type] = Number(p.value);

    const asIfUtc = Date.UTC(at.year, at.month - 1, at.day, at.hour % 24, at.minute, at.second);
    return (asIfUtc - (instant.getTime() - instant.getMilliseconds())) / 60000;
}

/** Instante UTC em que o relógio local marca a data e hora informadas. */
function localWallClockToUtc(
    year: number, month: number, day: number, hour = 0, timeZone = APP_TIMEZONE
): Date {
    const guess = Date.UTC(year, month - 1, day, hour, 0, 0);
    // Duas passadas convergem mesmo em fusos com horário de verão; em Recife,
    // que é UTC-3 fixo desde 2019, a primeira já é exata.
    let utc = guess - offsetMinutes(new Date(guess), timeZone) * 60000;
    utc = guess - offsetMinutes(new Date(utc), timeZone) * 60000;
    return new Date(utc);
}

/** Formata para exibição no fuso da aplicação — independe do dispositivo de quem lê. */
export function formatTimestamp(raw: string | Date): string {
    if (!raw) return '';
    return new Date(normalizeTimestamp(raw)).toLocaleString('pt-BR', { timeZone: APP_TIMEZONE });
}

/** Faixa [início, fim) em ISO UTC do dia local informado ('YYYY-MM-DD'). */
export function localDayRangeUtc(date: string, timeZone = APP_TIMEZONE): { startIso: string; endIso: string } {
    const [y, m, d] = date.split('-').map(Number);
    const start = localWallClockToUtc(y, m, d, 0, timeZone);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const end = localWallClockToUtc(
        next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, timeZone
    );
    return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Faixa [início, fim) em ISO UTC do mês local informado ('YYYY-MM'). */
export function localMonthRangeUtc(month: string, timeZone = APP_TIMEZONE): { startIso: string; endIso: string } {
    const [y, m] = month.split('-').map(Number);
    const start = localWallClockToUtc(y, m, 1, 0, timeZone);
    const end = localWallClockToUtc(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, timeZone);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Hora do dia local convertida para a hora UTC correspondente, em '00'–'23'.
 * Filtro de hora-do-dia é cíclico: 22h em Recife é 01h UTC do dia seguinte, e o
 * que importa para a comparação é apenas o campo hora.
 */
export function localHourToUtcHour(hour: string | number, timeZone = APP_TIMEZONE): string {
    const h = Number(hour);
    // Deslocamento vigente: filtro de hora-do-dia é cíclico, não se prende a uma
    // data. Usar uma data de referência fixa arriscaria pegar uma regra histórica
    // de fuso diferente da atual.
    const offset = offsetMinutes(new Date(), timeZone);
    const utcHour = ((((h * 60 - offset) / 60) % 24) + 24) % 24;
    return String(Math.floor(utcHour)).padStart(2, '0');
}
