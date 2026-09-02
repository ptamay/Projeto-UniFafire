import { localDayRangeUtc, localMonthRangeUtc, localHourToUtcHour } from '@/lib/time-filters';

// TASK-056 (Sprint 17) — construção da consulta do histórico.
//
// A trilha só filtrava por data/mês/hora, o que deixava sem resposta as duas
// perguntas centrais de um controle de chaves: "quem pegou a chave X?" e "o que
// o Fulano pegou?". Aqui entram portador, chave e tipo de movimentação.
//
// A montagem vive fora do componente de página para poder ser testada contra o
// banco sem renderizar nada — e para concentrar num ponto só a consulta que a
// migração para Postgres vai tornar assíncrona.

/** Vocabulário fechado de ações — também alimenta o seletor da UI. */
export const HISTORY_ACTIONS = [
    { value: 'withdraw', label: 'Retirada' },
    { value: 'return', label: 'Devolução' },
    { value: 'transfer', label: 'Transferência' },
] as const;

const ACTION_VALUES = new Set(HISTORY_ACTIONS.map(a => a.value as string));

export const HISTORY_PAGE_SIZE = 50;

export interface HistoryFilters {
    date?: string;
    month?: string;
    hour?: string;
    userId?: string;
    keyId?: string;
    action?: string;
    page?: number;
    limit?: number;
}

export interface HistoryQuery {
    sql: string;
    countSql: string;
    params: (string | number)[];
    countParams: (string | number)[];
    page: number;
    limit: number;
    offset: number;
}

const SELECT = `
        SELECT h.id, h.action, h.timestamp,
               k.name as key_name, k.room,
               COALESCE(u.full_name, u.username, e.name) as employee_name,
               p.username as confirmed_by,
               kt.justification
        FROM history h
        LEFT JOIN keys k ON h.key_id = k.id
        LEFT JOIN employees e ON h.employee_id = e.id
        LEFT JOIN users u ON h.user_id = u.id
        LEFT JOIN key_transactions kt ON h.transaction_id = kt.id
        LEFT JOIN users p ON kt.porteiro_id = p.id`;

/** Id positivo, ou null quando ausente/inválido — filtro impossível é ignorado, não quebra a tela. */
function parseId(raw?: string): number | null {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}

export function buildHistoryQuery(filters: HistoryFilters): HistoryQuery {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // Filtros temporais: faixa [início, fim) em UTC a partir do fuso do operador (TASK-055).
    if (filters.date) {
        const { startIso, endIso } = localDayRangeUtc(filters.date);
        conditions.push('h.timestamp >= ? AND h.timestamp < ?');
        params.push(startIso, endIso);
    }
    if (filters.month) {
        const { startIso, endIso } = localMonthRangeUtc(filters.month);
        conditions.push('h.timestamp >= ? AND h.timestamp < ?');
        params.push(startIso, endIso);
    }
    if (filters.hour) {
        conditions.push("strftime('%H', h.timestamp) = ?");
        params.push(localHourToUtcHour(filters.hour));
    }

    const userId = parseId(filters.userId);
    if (userId !== null) {
        conditions.push('h.user_id = ?');
        params.push(userId);
    }

    const keyId = parseId(filters.keyId);
    if (keyId !== null) {
        conditions.push('h.key_id = ?');
        params.push(keyId);
    }

    // Ação fora do vocabulário conhecido é descartada: um valor arbitrário vindo
    // da URL não deve virar condição nem filtrar tudo para fora sem explicação.
    if (filters.action && ACTION_VALUES.has(filters.action)) {
        conditions.push('h.action = ?');
        params.push(filters.action);
    }

    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

    const limit = filters.limit ?? HISTORY_PAGE_SIZE;
    const page = Math.max(1, Math.floor(filters.page ?? 1) || 1);
    const offset = (page - 1) * limit;

    return {
        sql: `${SELECT}${where} ORDER BY h.timestamp DESC LIMIT ? OFFSET ?`,
        countSql: `SELECT COUNT(*) as total FROM history h${where}`,
        params: [...params, limit, offset],
        countParams: params,
        page,
        limit,
        offset,
    };
}
