import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';
import { z } from 'zod';

const ProfileUpdateSchema = z.object({
    full_name: z.string().min(2, "Nome completo deve ter ao menos 2 caracteres.").optional().or(z.literal('')),
    matricula: z.string().optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
});

export async function GET() {
    try {
        const sessionCookie = (await cookies()).get('session')?.value;
        if (!sessionCookie) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const payload = await verifySession(sessionCookie);
        if (!payload) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });

        const stmt = db.prepare('SELECT username, role, full_name, matricula, phone FROM users WHERE id = ?');
        const user = stmt.get(payload.id);

        if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

        return NextResponse.json(user);
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session')?.value;
        if (!sessionCookie) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const payload = await verifySession(sessionCookie);
        if (!payload) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });

        const body = await request.json();
        
        // Zod validation
        const parsed = ProfileUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }
        
        const { full_name, matricula, phone } = parsed.data;

        const stmt = db.prepare('UPDATE users SET full_name = ?, matricula = ?, phone = ? WHERE id = ?');
        stmt.run(
            full_name || null,
            matricula || null,
            phone || null,
            payload.id
        );

        logAction(Number(payload.id), String(payload.username), 'UPDATE_PROFILE', 'Self', 'User updated their own profile');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
