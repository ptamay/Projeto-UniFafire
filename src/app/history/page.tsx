import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { query as pgQuery, queryOne } from '@/lib/pg';
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

    const history = await pgQuery<HistoryItem>(query.sql, query.params as never[]);
    // count(*) volta STRING no Postgres: sem Number(), totalPages sairia de uma
    // divisao sobre string e a paginacao da TASK-057 se perderia.
    const countRow = await queryOne<{ total: string }>(query.countSql, query.countParams as never[]);
    const total = Number(countRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    // TASK-056: os seletores são alimentados apenas por quem/o que realmente tem
    // movimentação registrada — filtrar por alguém sem histórico não é uma opção
    // útil, e a lista se mantém curta sem depender do tamanho do cadastro.
    // COLLATE NOCASE e exclusivo do SQLite; no Postgres a ordenacao sem
    // diferenciar maiusculas e lower(). E SELECT DISTINCT exige a expressao do
    // ORDER BY na lista de selecao — dai a subconsulta, que preserva a semantica
    // em vez de mudar o DISTINCT.
    const filterUsers = await pgQuery<{ id: number; name: string }>(`
        SELECT id, name FROM (
            SELECT DISTINCT u.id, COALESCE(u.full_name, u.username) as name
            FROM history h JOIN users u ON h.user_id = u.id
        ) t
        WHERE name IS NOT NULL
        ORDER BY lower(name)
    `);

    const filterKeys = await pgQuery<{ id: number; name: string; room: string | null }>(`
        SELECT id, name, room FROM (
            SELECT DISTINCT k.id, k.name, k.room
            FROM history h JOIN keys k ON h.key_id = k.id
        ) t
        ORDER BY lower(name)
    `);

    return <HistoryClient
        history={history}
        userRole={session.role}
        username={session.username}
        currentPage={query.page}
        totalPages={totalPages}
        totalRecords={total}
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
