import { query as pgQuery, queryOne } from '@/lib/pg';
import { localDayRangeUtc, localMonthRangeUtc, localHourToUtcHour } from '@/lib/time-filters';
import { comDatasEmIso } from '@/lib/linhas-json';

// TASK-131 (emenda do ADR-029) — a consulta da trilha de ações (`action_logs`), numa função só.
//
// Saiu de `GET /api/logs` para ser chamada também pela página `/logs`, que agora entrega a
// primeira página já na abertura (antes a tela abria em "Carregando…"). Filtros e paginação
// seguintes continuam pela rota. Quem chama verifica o papel ANTES (ADMIN/GESTOR).

export type CategoriaDeLog = 'all' | 'system' | 'security' | 'login';

export interface FiltrosDeLog {
    page: number;
    limit: number;
    search?: string;
    date?: string;
    month?: string;
    hour?: string;
    category?: CategoriaDeLog | string;
}

export interface RegistroDeLog {
    id: number;
    timestamp: string;
    user_id?: number | null;
    username?: string | null;
    action?: string | null;
    target?: string | null;
    ip_address?: string | null;
    details?: string | null;
}

export interface PaginaDeLogs {
    logs: RegistroDeLog[];
    total: number;
    page: number;
    totalPages: number;
}

export async function listarLogs(f: FiltrosDeLog): Promise<PaginaDeLogs> {
    const { page, limit, search = '', date = '', month = '', hour = '', category = 'all' } = f;

    let sql = 'SELECT * FROM action_logs';
    let countSql = 'SELECT COUNT(*) as total FROM action_logs';
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    // O marcador do Postgres e posicional NUMERADO: `$n` tem de acompanhar a ordem de push no
    // array. `p()` emite o proximo indice a partir do tamanho atual de `params`, para que numero
    // e valor nao possam divergir conforme os filtros entram e saem.
    const p = (deslocamento = 0) => `$${params.length + 1 + deslocamento}`;

    if (category === 'security') {
        conditions.push("action IN ('LOGIN_FAILED', 'RATE_LIMIT_EXCEEDED', 'ACCOUNT_LOCKOUT', 'CHANGE_PASSWORD', 'PASSWORD_RESET', 'TRANSACTION_BYPASS', 'CLEAR_DATABASE', 'CLEAR_HISTORY')");
    } else if (category === 'login') {
        conditions.push("action IN ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKOUT')");
    } else if (category === 'system') {
        conditions.push("action NOT IN ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKOUT')");
    }

    if (search) {
        conditions.push(`(username LIKE ${p()} OR action LIKE ${p(1)} OR target LIKE ${p(2)} OR ip_address LIKE ${p(3)})`);
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam, searchParam);
    }

    // TASK-055: filtros no fuso do operador contra coluna em UTC — ver history/page.tsx.
    if (date) {
        const { startIso, endIso } = localDayRangeUtc(date);
        conditions.push(`timestamp >= ${p()} AND timestamp < ${p(1)}`);
        params.push(startIso, endIso);
    }

    if (month) {
        const { startIso, endIso } = localMonthRangeUtc(month);
        conditions.push(`timestamp >= ${p()} AND timestamp < ${p(1)}`);
        params.push(startIso, endIso);
    }

    if (hour) {
        // to_char no lugar de strftime. O FUSO NAO se move para o SQL: localHourToUtcHour
        // (TASK-055) ja converte a hora do operador para UTC em JS, e a comparacao aqui e entre
        // horas UTC.
        conditions.push(`to_char(timestamp AT TIME ZONE 'UTC', 'HH24') = ${p()}`);
        params.push(localHourToUtcHour(hour));
    }

    if (conditions.length > 0) {
        const where = ' WHERE ' + conditions.join(' AND ');
        sql += where;
        countSql += where;
    }

    sql += ` ORDER BY timestamp DESC LIMIT ${p()} OFFSET ${p(1)}`;
    params.push(limit, (page - 1) * limit);

    const logs = await pgQuery<RegistroDeLog>(sql, params);

    // count(*) volta STRING: sem Number(), `total` iria para o JSON como string e totalPages
    // sairia de uma divisao sobre string.
    const total = await queryOne<{ total: string }>(countSql, params.slice(0, -2));
    const totalNum = Number(total?.total ?? 0);

    return {
        logs: comDatasEmIso(logs) as RegistroDeLog[],
        total: totalNum,
        page,
        totalPages: Math.ceil(totalNum / limit),
    };
}
