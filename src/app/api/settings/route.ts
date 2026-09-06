import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/pg';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

export async function GET() {
    try {
        const settingsArr = await query<{ key: string; value: string }>('SELECT key, value FROM settings');
        
        const settingsMap: Record<string, string> = {};
        settingsArr.forEach(s => settingsMap[s.key] = s.value);

        return NextResponse.json({ 
            autoLogoutTime: settingsMap['auto_logout_time'] || '18:30',
            defaultResetPassword: settingsMap['default_reset_password'] || 'saojose123'
        });
    } catch {
        return NextResponse.json({ autoLogoutTime: '18:30', defaultResetPassword: 'saojose123' });
    }
}

export async function POST(req: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const session = await verifySession(sessionCookie.value);
        if (!session || (session.role !== 'ADMIN' && session.role !== 'GESTOR')) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const body = await req.json();
        
        // Client dedicado: as quatro configuracoes entram juntas ou nenhuma
        // entra. ON CONFLICT DO UPDATE ja tem a mesma sintaxe nos dois dialetos —
        // o que muda e so o marcador de parametro.
        await withTransaction(async (tx) => {
            const gravar = (chave: string, valor: string) => tx.execute(
                `INSERT INTO settings (key, value) VALUES ($1, $2)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
                [chave, valor],
            );

            // Suporta 'time' (antigo) ou 'autoLogoutTime'
            const logoutTime = body.autoLogoutTime || body.time;
            if (logoutTime) await gravar('auto_logout_time', String(logoutTime));
            if (body.defaultResetPassword) await gravar('default_reset_password', String(body.defaultResetPassword));
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Error updating settings:', e);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
