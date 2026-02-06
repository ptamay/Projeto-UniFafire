import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        let session;
        try {
            session = JSON.parse(sessionCookie.value);
        } catch {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        if (session.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const search = searchParams.get('search') || '';
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM action_logs';
        let countQuery = 'SELECT COUNT(*) as total FROM action_logs';
        let params: any[] = [];

        if (search) {
            const condition = ' WHERE username LIKE ? OR action LIKE ? OR target LIKE ?';
            query += condition;
            countQuery += condition;
            const searchParam = `%${search}%`;
            params = [searchParam, searchParam, searchParam];
        }

        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const logs = db.prepare(query).all(...params);
        const total = db.prepare(countQuery).get(...(search ? [params[0], params[1], params[2]] : [])) as any;

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
