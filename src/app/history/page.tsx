import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import db from '@/lib/db';
import HistoryClient from './HistoryClient';

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string, date?: string, month?: string, hour?: string }> }) {
    const resolvedParams = await searchParams;
    const page = parseInt(resolvedParams?.page || '1', 10) || 1;
    const date = resolvedParams?.date || '';
    const month = resolvedParams?.month || '';
    const hour = resolvedParams?.hour || '';
    const limit = 50;
    const offset = (page - 1) * limit;

    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) redirect('/login');

    let session;
    try {
        session = await verifySession(sessionCookie.value);
        if (!session) throw new Error();
    } catch { redirect('/login'); }

    let query = `
        SELECT h.id, h.action, h.timestamp, 
               k.name as key_name, k.room, 
               COALESCE(u.full_name, u.username, e.name) as employee_name,
               p.username as confirmed_by
        FROM history h
        LEFT JOIN keys k ON h.key_id = k.id
        LEFT JOIN employees e ON h.employee_id = e.id
        LEFT JOIN users u ON h.user_id = u.id
        LEFT JOIN key_transactions kt ON h.transaction_id = kt.id
        LEFT JOIN users p ON kt.porteiro_id = p.id
    `;
    
    let countQuery = 'SELECT COUNT(*) as total FROM history h';
    let conditions = [];
    let params: any[] = [];

    if (date) {
        conditions.push('DATE(h.timestamp) = DATE(?)');
        params.push(date);
    }
    if (month) {
        conditions.push("strftime('%Y-%m', h.timestamp) = ?");
        params.push(month);
    }
    if (hour) {
        conditions.push("strftime('%H', h.timestamp) = ?");
        params.push(hour.padStart(2, '0'));
    }

    if (conditions.length > 0) {
        const whereClause = ' WHERE ' + conditions.join(' AND ');
        query += whereClause;
        countQuery += whereClause;
    }

    query += ' ORDER BY h.timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const history = db.prepare(query).all(...params) as any[];

    const countParams = params.slice(0, -2);
    const countRow = db.prepare(countQuery).get(...countParams) as { total: number };
    const totalPages = Math.ceil(countRow.total / limit);

    return <HistoryClient 
        history={history} 
        userRole={session.role} 
        username={session.username} 
        currentPage={page} 
        totalPages={totalPages} 
        initialFilters={{ date, month, hour }}
    />;
}
