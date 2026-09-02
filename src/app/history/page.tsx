import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import db from '@/lib/db';
import { buildHistoryQuery } from '@/lib/history-query';
import HistoryClient, { type HistoryItem } from './HistoryClient';

interface HistorySearchParams {
    page?: string;
    date?: string;
    month?: string;
    hour?: string;
    userId?: string;
    keyId?: string;
    action?: string;
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<HistorySearchParams> }) {
    const p = (await searchParams) || {};

    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) redirect('/login');

    let session;
    try {
        session = await verifySession(sessionCookie.value);
        if (!session) throw new Error();
    } catch { redirect('/login'); }

    const query = buildHistoryQuery({
        date: p.date || '',
        month: p.month || '',
        hour: p.hour || '',
        userId: p.userId || '',
        keyId: p.keyId || '',
        action: p.action || '',
        page: parseInt(p.page || '1', 10) || 1,
    });

    const history = db.prepare(query.sql).all(...query.params) as HistoryItem[];
    const countRow = db.prepare(query.countSql).get(...query.countParams) as { total: number };
    const totalPages = Math.max(1, Math.ceil(countRow.total / query.limit));

    // TASK-056: os seletores são alimentados apenas por quem/o que realmente tem
    // movimentação registrada — filtrar por alguém sem histórico não é uma opção
    // útil, e a lista se mantém curta sem depender do tamanho do cadastro.
    const filterUsers = db.prepare(`
        SELECT DISTINCT u.id, COALESCE(u.full_name, u.username) as name
        FROM history h JOIN users u ON h.user_id = u.id
        WHERE name IS NOT NULL
        ORDER BY name COLLATE NOCASE
    `).all() as { id: number; name: string }[];

    const filterKeys = db.prepare(`
        SELECT DISTINCT k.id, k.name, k.room
        FROM history h JOIN keys k ON h.key_id = k.id
        ORDER BY k.name COLLATE NOCASE
    `).all() as { id: number; name: string; room: string | null }[];

    return <HistoryClient
        history={history}
        userRole={session.role}
        username={session.username}
        currentPage={query.page}
        totalPages={totalPages}
        totalRecords={countRow.total}
        filterOptions={{ users: filterUsers, keys: filterKeys }}
        initialFilters={{
            date: p.date || '',
            month: p.month || '',
            hour: p.hour || '',
            userId: p.userId || '',
            keyId: p.keyId || '',
            action: p.action || '',
        }}
    />;
}
