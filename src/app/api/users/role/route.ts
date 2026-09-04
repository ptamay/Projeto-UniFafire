import { NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/pg';
import { cookies } from 'next/headers';
import { logAction } from '@/lib/logger';
import { verifySession } from '@/lib/session';

interface RoleRow {
    id: number;
    username: string;
    role: string;
}

export async function POST(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const session = await verifySession(sessionCookie.value);
        if (!session || session.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { targetUserId, newRole } = body;

        if (!targetUserId || !newRole) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (session.id === targetUserId) {
            return NextResponse.json({ error: 'Você não pode alterar seu próprio cargo.' }, { status: 400 });
        }

        const targetUser = await queryOne<RoleRow>('SELECT * FROM users WHERE id = $1', [targetUserId]);

        if (!targetUser) {
            return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
        }

        // Integrity Check: Do not allow demotion if user is the last ADMIN
        if (targetUser.role === 'ADMIN' && newRole === 'PORTEIRO') {
            // count(*) volta STRING no Postgres: sem Number(), '1' <= 1 e falso e
            // o unico admin poderia ser rebaixado.
            const result = await queryOne<{ count: string }>("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN' AND active");
            if (Number(result?.count) <= 1) {
                return NextResponse.json({ error: 'Ação bloqueada: Não é possível rebaixar o único administrador.' }, { status: 400 });
            }
        }

        // Apply Change
        await execute('UPDATE users SET role = $1 WHERE id = $2', [newRole, targetUserId]);

        // Action Log
        logAction(session.id, session.username, 'CHANGE_ROLE', targetUser.username, `Changed role from ${targetUser.role} to ${newRole}`);

        return NextResponse.json({ success: true, message: `Usuário ${newRole === 'ADMIN' ? 'promovido' : 'rebaixado'} com sucesso.` });

    } catch (error) {
        console.error('Error changing role:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
