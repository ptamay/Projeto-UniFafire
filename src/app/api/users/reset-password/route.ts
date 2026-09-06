import { NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/pg';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';
import { SENHA_PADRAO_RESET } from '@/lib/settings-policy';

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
        const targetUser = await queryOne<{ username: string }>(
            'SELECT username FROM users WHERE id = $1', [targetUserId],
        );
        if (!targetUser) {
            return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
        }

        // Use default from settings
        const settingsRow = await queryOne<{ value: string }>(
            "SELECT value FROM settings WHERE key = 'default_reset_password'",
        );
        const defaultPassword = settingsRow ? settingsRow.value : SENHA_PADRAO_RESET;

        // Hash and update
        const newHash = await bcrypt.hash(defaultPassword, 10);
        await execute(
            'UPDATE users SET password_hash = $1, requires_password_change = true WHERE id = $2',
            [newHash, targetUserId],
        );

        // Action Log
        await logAction(session.id, session.username, 'RESET_PASSWORD', targetUser.username, `Alterada senha do usuário ${targetUser.username}`);

        return NextResponse.json({ 
            success: true, 
            message: newPassword ? `Senha do usuário ${targetUser.username} alterada com sucesso.` : `Senha do usuário ${targetUser.username} resetada para o padrão.` 
        });
    } catch (error) {
        console.error('Reset password error:', error);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
