import { NextResponse } from 'next/server';
import { query as pgQuery, queryOne } from '@/lib/pg';
import { localDayRangeUtc, localMonthRangeUtc, localHourToUtcHour } from '@/lib/time-filters';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

export async function GET(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        let session;
        try {
            session = await verifySession(sessionCookie.value);
            if (!session) throw new Error('Invalid session');
        } catch {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        if (session.role !== 'ADMIN' && session.role !== 'GESTOR') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const searchParams = new URL(request.url).searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const search = searchParams.get('search') || '';
        const date = searchParams.get('date') || '';
        const month = searchParams.get('month') || '';
        const hour = searchParams.get('hour') || '';
        const category = searchParams.get('category') || 'all'; 

        const tableName = 'action_logs';

        let query = `SELECT * FROM ${tableName}`;
        let countQuery = `SELECT COUNT(*) as total FROM ${tableName}`;
        const conditions: string[] = [];
        const params: (string | number)[] = [];
        // O marcador do Postgres e posicional NUMERADO: `$n` tem de acompanhar a
        // ordem de push no array. `p()` emite o proximo indice a partir do
        // tamanho atual de `params`, para que numero e valor nao possam divergir
        // conforme os filtros entram e saem.
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
            // to_char no lugar de strftime. O FUSO NAO se move para o SQL:
            // localHourToUtcHour (TASK-055) ja converte a hora do operador para
            // UTC em JS, e a comparacao aqui e entre horas UTC. Mover a conversao
            // para ca reescreveria aquela correcao sem necessidade.
            conditions.push(`to_char(timestamp AT TIME ZONE 'UTC', 'HH24') = ${p()}`);
            params.push(localHourToUtcHour(hour));
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        query += ` ORDER BY timestamp DESC LIMIT ${p()} OFFSET ${p(1)}`;
        const offset = (page - 1) * limit;
        params.push(limit, offset);

        const logs = await pgQuery(query, params);

        const countParams = params.slice(0, -2);
        // count(*) volta STRING: sem Number(), `total` iria para o JSON como
        // string e totalPages sairia de uma divisao sobre string.
        const total = await queryOne<{ total: string }>(countQuery, countParams);
        const totalNum = Number(total?.total ?? 0);

        return NextResponse.json({
            logs,
            total: totalNum,
            page,
            totalPages: Math.ceil(totalNum / limit)
        });

    } catch (error) {
        console.error('Fetch logs error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
