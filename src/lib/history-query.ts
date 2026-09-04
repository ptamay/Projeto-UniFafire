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
               COALESCE(u.full_name, u.username) as employee_name,
               p.username as confirmed_by,
               kt.justification
        FROM history h
        LEFT JOIN keys k ON h.key_id = k.id
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
    // Marcador posicional NUMERADO do Postgres. O indice sai do tamanho corrente
    // de `params`, e nao de contagem manual: assim numero e valor nao podem
    // divergir conforme os filtros entram e saem. Trocar $n entre dois filtros
    // nao daria erro de sintaxe — daria o resultado errado, em silencio.
    const p = (deslocamento = 0) => `$${params.length + 1 + deslocamento}`;

    // Filtros temporais: faixa [início, fim) em UTC a partir do fuso do operador (TASK-055).
    if (filters.date) {
        const { startIso, endIso } = localDayRangeUtc(filters.date);
        conditions.push(`h.timestamp >= ${p()} AND h.timestamp < ${p(1)}`);
        params.push(startIso, endIso);
    }
    if (filters.month) {
        const { startIso, endIso } = localMonthRangeUtc(filters.month);
        conditions.push(`h.timestamp >= ${p()} AND h.timestamp < ${p(1)}`);
        params.push(startIso, endIso);
    }
    if (filters.hour) {
        // to_char no lugar de strftime. O fuso NAO se move para o SQL:
        // localHourToUtcHour (TASK-055) ja converte a hora do operador para UTC.
        conditions.push(`to_char(h.timestamp AT TIME ZONE 'UTC', 'HH24') = ${p()}`);
        params.push(localHourToUtcHour(filters.hour));
    }

    const userId = parseId(filters.userId);
    if (userId !== null) {
        conditions.push(`h.user_id = ${p()}`);
        params.push(userId);
    }

    const keyId = parseId(filters.keyId);
    if (keyId !== null) {
        conditions.push(`h.key_id = ${p()}`);
        params.push(keyId);
    }

    // Ação fora do vocabulário conhecido é descartada: um valor arbitrário vindo
    // da URL não deve virar condição nem filtrar tudo para fora sem explicação.
    if (filters.action && ACTION_VALUES.has(filters.action)) {
        conditions.push(`h.action = ${p()}`);
        params.push(filters.action);
    }

    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

    const limit = filters.limit ?? HISTORY_PAGE_SIZE;
    const page = Math.max(1, Math.floor(filters.page ?? 1) || 1);
    const offset = (page - 1) * limit;

    return {
        sql: `${SELECT}${where} ORDER BY h.timestamp DESC LIMIT ${p()} OFFSET ${p(1)}`,
        countSql: `SELECT COUNT(*) as total FROM history h${where}`,
        params: [...params, limit, offset],
        countParams: params,
        page,
        limit,
        offset,
    };
}
