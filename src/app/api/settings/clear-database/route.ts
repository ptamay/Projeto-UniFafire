import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { withMaintenanceMode } from '@/lib/db-maintenance';

export async function POST() {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const session = await verifySession(sessionCookie.value);
        if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado. Apenas administradores.' }, { status: 403 });

        const tablesToClear = ['history', 'action_logs', 'audit_logs', 'keys', 'employees'];
        
        // Bypass de manutenção (REQ-014): history tem triggers de imutabilidade
        // (TASK-030) que bloqueiam DELETE fora deste fluxo.
        withMaintenanceMode(() => {
            for (const table of tablesToClear) {
                try {
                    // Check if table exists first to avoid error noise
                    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
                    if (tableExists) {
                        db.prepare(`DELETE FROM ${table}`).run();
                        db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
                    }
                } catch (err) {
                    console.error(`Error clearing table ${table}:`, err);
                }
            }
        });

        return NextResponse.json({ success: true, message: 'Banco de dados limpo com sucesso!' });
    } catch (e) {
        console.error('Error clearing database:', e);
        return NextResponse.json({ error: 'Erro interno no servidor ao limpar banco de dados' }, { status: 500 });
    }
}
