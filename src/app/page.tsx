import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { query as pgQuery, queryOne } from '@/lib/pg';
import DashboardClient, { type Key, type User } from './components/DashboardClient';

interface RawKeyRow {
    id: number;
    name: string;
    room: string | null;
    status: 'available' | 'in_use';
    employee_name: string | null;
    employee_username: string | null;
    employee_role: string | null;
    // json_build_object devolve `json` e o driver entrega o objeto pronto —
    // no SQLite era TEXTO, e por isso havia um JSON.parse do outro lado.
    pending_info: Key['pending_info'] | null;
    in_use_since: string | null;
    withdraw_justification: string | null;
}

async function getData() {
    const rawKeys = await pgQuery<RawKeyRow>(`
        SELECT k.*, u.full_name as employee_name, u.username as employee_username, u.role as employee_role,
               (SELECT json_build_object(
                   'transaction_id', kt.id,
                   'action', kt.action,
                   'user_confirmed', kt.user_confirmed_at IS NOT NULL,
                   'porteiro_confirmed', kt.porteiro_confirmed_at IS NOT NULL,
                   'user_name', u_kt.full_name,
                   'user_role', u_kt.role,
                   'user_id', kt.user_id,
                   'porteiro_id', kt.porteiro_id
               )
                FROM key_transactions kt
                LEFT JOIN users u_kt ON kt.user_id = u_kt.id
                WHERE kt.key_id = k.id AND kt.status IN ('pending', 'porteiro_confirmed')
                LIMIT 1) as pending_info,
               (SELECT completed_at FROM key_transactions
                WHERE key_id = k.id AND action = 'withdraw' AND status = 'completed'
                ORDER BY completed_at DESC LIMIT 1) as in_use_since,
               (SELECT justification FROM key_transactions
                WHERE key_id = k.id AND action = 'withdraw' AND status = 'completed'
                ORDER BY completed_at DESC LIMIT 1) as withdraw_justification
        FROM keys k
        LEFT JOIN users u ON k.user_id = u.id
        WHERE k.active
        ORDER BY lower(k.name) ASC
    `);

    const keys: Key[] = rawKeys.map((k) => ({
        ...k,
        room: k.room ?? undefined,
        employee_name: k.employee_name ?? undefined,
        employee_role: k.employee_role ?? undefined,
        // O driver ja entrega o objeto: json_build_object devolve `json`.
        pending_info: k.pending_info ?? undefined,
        in_use_since: k.in_use_since ?? undefined,
        withdraw_justification: k.withdraw_justification ?? undefined,
    }));
    
    // Pegar apenas usuários que podem receber chaves (FUNCIONARIO e ALUNO)
    const users = await pgQuery<{ id: number; username: string; full_name: string | null; role: string }>(`
        SELECT id, username, full_name, role
        FROM users
        WHERE active AND role IN ('FUNCIONARIO', 'ALUNO')
        ORDER BY lower(COALESCE(full_name, username)) ASC
    `);

    const mappedUsers: User[] = users.map((u) => ({
        id: u.id,
        name: u.full_name || u.username,
        role: u.role,
        username: u.username,
        full_name: u.full_name ?? undefined,
    }));

    return { keys, users: mappedUsers };
}

export default async function Home() {
    const session = (await cookies()).get('session');
    if (!session) redirect('/login');

    let sessionData;
    try {
        sessionData = await verifySession(session.value);
        if (!sessionData) throw new Error('Invalid session');
        const user = await queryOne('SELECT id FROM users WHERE id = $1', [sessionData.id]);
        if (!user) redirect('/login');
    } catch {
        redirect('/login');
    }

    const { keys, users } = await getData();

    return (
        <main>
            <DashboardClient
                initialKeys={keys}
                initialUsers={users}
                userRole={sessionData.role || 'FUNCIONARIO'}
                userId={sessionData.id}
                username={sessionData.username}
            />
        </main>
    );
}
