import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';

export async function POST(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        
        const session = await verifySession(sessionCookie.value);
        if (!session || (session.role !== 'ADMIN' && session.role !== 'GESTOR')) {
            return NextResponse.json({ error: 'Acesso negado. Apenas administradores e gestores.' }, { status: 403 });
        }

        const body = await request.json();
        // Accept both userId (from client) and targetUserId (legacy/consistency)
        const targetUserId = body.userId || body.targetUserId;
        const { newPassword } = body;

        if (!targetUserId) {
            return NextResponse.json({ error: 'ID do usuário é obrigatório' }, { status: 400 });
        }

        // Get target user username for logging
        const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(targetUserId) as { username: string } | undefined;
        if (!targetUser) {
            return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
        }

        // Use default from settings
        const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'default_reset_password'").get() as { value: string } | undefined;
        const defaultPassword = settingsRow ? settingsRow.value : 'unifafire123';

        // Hash and update
        const newHash = await bcrypt.hash(defaultPassword, 10);
        db.prepare('UPDATE users SET password_hash = ?, requires_password_change = 1 WHERE id = ?').run(newHash, targetUserId);

        // Action Log
        logAction(session.id, session.username, 'RESET_PASSWORD', targetUser.username, `Alterada senha do usuário ${targetUser.username}`);

        return NextResponse.json({ 
            success: true, 
            message: newPassword ? `Senha do usuário ${targetUser.username} alterada com sucesso.` : `Senha do usuário ${targetUser.username} resetada para o padrão.` 
        });
    } catch (error) {
        console.error('Reset password error:', error);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
