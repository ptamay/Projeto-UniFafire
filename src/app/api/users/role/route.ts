import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { logAction } from '@/lib/logger';

export async function POST(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);
        if (session.role !== 'ADMIN') {
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

        const targetUserStmt = db.prepare('SELECT * FROM users WHERE id = ?');
        const targetUser = targetUserStmt.get(targetUserId) as any;

        if (!targetUser) {
            return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
        }

        // Integrity Check: Do not allow demotion if user is the last ADMIN
        if (targetUser.role === 'ADMIN' && newRole === 'USER') {
            const adminCountStmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'");
            const result = adminCountStmt.get() as any;
            if (result.count <= 1) {
                return NextResponse.json({ error: 'Ação bloqueada: Não é possível rebaixar o único administrador.' }, { status: 400 });
            }
        }

        // Apply Change
        const updateStmt = db.prepare('UPDATE users SET role = ? WHERE id = ?');
        updateStmt.run(newRole, targetUserId);

        // Action Log
        logAction(session.id, session.username, 'CHANGE_ROLE', targetUser.username, `Changed role from ${targetUser.role} to ${newRole}`);

        return NextResponse.json({ success: true, message: `Usuário ${newRole === 'ADMIN' ? 'promovido' : 'rebaixado'} com sucesso.` });

    } catch (error) {
        console.error('Error changing role:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
