import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import db from '@/lib/db';
import DashboardClient, { type Key, type User } from './components/DashboardClient';

interface RawKeyRow {
    id: number;
    name: string;
    room: string | null;
    status: 'available' | 'in_use';
    employee_id: number | null;
    employee_name: string | null;
    employee_username: string | null;
    employee_role: string | null;
    pending_info: string | null;
}

function getData() {
    const rawKeys = db.prepare(`
        SELECT k.*, u.full_name as employee_name, u.username as employee_username, u.role as employee_role,
               (SELECT json_object(
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
                LIMIT 1) as pending_info
        FROM keys k
        LEFT JOIN users u ON k.user_id = u.id
        WHERE k.active = 1
        ORDER BY k.name ASC
    `).all() as RawKeyRow[];

    const keys: Key[] = rawKeys.map((k) => ({
        ...k,
        room: k.room ?? undefined,
        employee_id: k.employee_id ?? undefined,
        employee_name: k.employee_name ?? undefined,
        employee_role: k.employee_role ?? undefined,
        pending_info: k.pending_info ? JSON.parse(k.pending_info) : undefined,
    }));
    
    // Pegar apenas usuários que podem receber chaves (FUNCIONARIO e ALUNO)
    const users = db.prepare(`
        SELECT id, username, full_name, role
        FROM users
        WHERE active = 1 AND role IN ('FUNCIONARIO', 'ALUNO')
        ORDER BY COALESCE(full_name, username) ASC
    `).all() as { id: number; username: string; full_name: string | null; role: string }[];

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
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(sessionData.id);
        if (!user) redirect('/login');
    } catch {
        redirect('/login');
    }

    const { keys, users } = getData();

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
