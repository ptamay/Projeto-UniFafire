import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { queryOne, execute } from '@/lib/pg';
import { verifySession, signSession } from '@/lib/session';
import { logAction } from '@/lib/logger';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { UserAuthRow } from '@/lib/db-rows';
import { opcoesCookieSessao } from '@/lib/session-cookie';

const PasswordChangeSchema = z.object({
    currentPassword: z.string().min(1, "A senha atual é obrigatória"),
    newPassword: z.string().min(8, "A nova senha deve ter no mínimo 8 caracteres"),
});

export async function PUT(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session')?.value;
        if (!sessionCookie) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const payload = await verifySession(sessionCookie);
        if (!payload) return NextResponse.json({ error: 'Sessão inválida ou expirada' }, { status: 401 });

        const body = await request.json();
        const parsed = PasswordChangeSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }

        const { currentPassword, newPassword } = parsed.data;

        // Recupera o usuário
        const user = await queryOne<UserAuthRow>(
            'SELECT id, username, password_hash, role FROM users WHERE id = $1', [payload.id],
        );

        if (!user) {
            return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
        }

        // Valida a senha atual
        const match = await bcrypt.compare(currentPassword, user.password_hash);
        if (!match) {
            return NextResponse.json({ error: 'A senha atual está incorreta' }, { status: 403 });
        }

        // Hash da nova senha
        const hashedNew = await bcrypt.hash(newPassword, 10);

        // Atualiza no banco
        await execute('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedNew, user.id]);

        await logAction(user.id, user.username, 'CHANGE_PASSWORD', 'Self', 'User changed their password via security page');

        // Cria uma nova sessão com o novo fragmento de hash
        const pwd_hash = hashedNew.slice(-10);
        const newPayload = { id: user.id, username: user.username, role: user.role, pwd_hash };
        const newSessionToken = await signSession(newPayload);

        // Renova o cookie: o usuário acabou de provar identidade.
        (await cookies()).set(opcoesCookieSessao(newSessionToken));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Erro ao trocar a senha:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
