import { NextResponse } from 'next/server';
import db from '@/lib/db';
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

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const search = searchParams.get('search') || '';
        const date = searchParams.get('date') || '';
        const month = searchParams.get('month') || '';
        const hour = searchParams.get('hour') || '';
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM action_logs';
        let countQuery = 'SELECT COUNT(*) as total FROM action_logs';
        let conditions = [];
        let params: any[] = [];

        if (search) {
            conditions.push('(username LIKE ? OR action LIKE ? OR target LIKE ? OR ip_address LIKE ?)');
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam, searchParam);
        }

        if (date) {
            conditions.push('DATE(timestamp) = DATE(?)');
            params.push(date);
        }

        if (month) {
            conditions.push("strftime('%Y-%m', timestamp) = ?");
            params.push(month);
        }

        if (hour) {
            conditions.push("strftime('%H', timestamp) = ?");
            params.push(hour.padStart(2, '0'));
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const logs = db.prepare(query).all(...params);
        
        // For countQuery, we need all params EXCEPT the last two (limit/offset)
        const countParams = params.slice(0, -2);
        const total = db.prepare(countQuery).get(...countParams) as any;

        return NextResponse.json({
            logs,
            total: total.total,
            page,
            totalPages: Math.ceil(total.total / limit)
        });

    } catch (error) {
        console.error('Fetch logs error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
