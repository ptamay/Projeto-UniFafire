import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { logAction } from '@/lib/logger';
import { verifySession } from '@/lib/session';
import { withMaintenanceMode } from '@/lib/db-maintenance';
import { logStructured } from '@/lib/structured-logger';

export async function DELETE(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        let session;
        try {
            session = await verifySession(sessionCookie.value);
            if (!session) throw new Error();
        } catch {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        if (session.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // TASK-031 (REQ-014): trilha gravada ANTES da deleção
        const pending = (db.prepare('SELECT COUNT(*) as c FROM history').get() as { c: number }).c;
        await logAction(session.id, session.username, 'CLEAR_HISTORY', 'History Table', `Iniciando limpeza de ${pending} registros`);
        logStructured('warn', 'destructive_operation', {
            op: 'history-clear',
            phase: 'pre',
            user_id: session.id,
            username: session.username,
            records: pending,
        });

        // Clear History — bypass de manutenção (REQ-014): triggers de imutabilidade
        // (TASK-030) bloqueiam DELETE fora deste fluxo.
        const info = withMaintenanceMode(() => db.prepare('DELETE FROM history').run());

        logStructured('warn', 'destructive_operation', {
            op: 'history-clear',
            phase: 'done',
            user_id: session.id,
            username: session.username,
            records: info.changes,
        });

        return NextResponse.json({ success: true, count: info.changes });

    } catch (error) {
        console.error('Clear history error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
