import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

export async function GET() {
    try {
        const settingsArr = db.prepare("SELECT key, value FROM settings").all() as { key: string, value: string }[];
        
        const settingsMap: Record<string, string> = {};
        settingsArr.forEach(s => settingsMap[s.key] = s.value);

        return NextResponse.json({ 
            autoLogoutTime: settingsMap['auto_logout_time'] || '18:30',
            backupTime: settingsMap['backup_time'] || '03:00',
            backupCount: parseInt(settingsMap['backup_retention_count'] || '3', 10),
            defaultResetPassword: settingsMap['default_reset_password'] || 'saojose123'
        });
    } catch {
        return NextResponse.json({ autoLogoutTime: '18:30', backupTime: '03:00', backupCount: 3, defaultResetPassword: 'saojose123' });
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
        
        const trans = db.transaction(() => {
            // Suporta 'time' (antigo) ou 'autoLogoutTime'
            const logoutTime = body.autoLogoutTime || body.time;
            if (logoutTime) {
                db.prepare("INSERT INTO settings (key, value) VALUES ('auto_logout_time', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(logoutTime);
            }
            if (body.backupTime) {
                db.prepare("INSERT INTO settings (key, value) VALUES ('backup_time', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(body.backupTime);
            }
            if (body.backupCount !== undefined) {
                db.prepare("INSERT INTO settings (key, value) VALUES ('backup_retention_count', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(body.backupCount));
            }
            if (body.defaultResetPassword) {
                db.prepare("INSERT INTO settings (key, value) VALUES ('default_reset_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(body.defaultResetPassword);
            }
        });
        trans();

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Error updating settings:', e);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
