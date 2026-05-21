import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/transactions/[id]/cancel
export async function POST(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const transactionId = parseInt(id, 10);

        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const tx = db.prepare('SELECT * FROM key_transactions WHERE id = ?').get(transactionId) as any;
        if (!tx) return NextResponse.json({ error: 'Transação não encontrada.' }, { status: 404 });

        // Apenas porteiro que iniciou, admin, ou o próprio usuário pode cancelar
        const canCancel = ['ADMIN', 'GESTOR'].includes(session.role) || 
                          tx.porteiro_id === session.id || 
                          tx.user_id === session.id;

        if (!canCancel) {
            return NextResponse.json({ error: 'Sem permissão para cancelar esta transação.' }, { status: 403 });
        }

        if (!['pending', 'porteiro_confirmed'].includes(tx.status)) {
            return NextResponse.json({ error: 'Esta transação não pode ser cancelada.' }, { status: 400 });
        }

        db.prepare("UPDATE key_transactions SET status = 'cancelled', completed_at = ? WHERE id = ?")
            .run(new Date().toISOString(), transactionId);

        logAction(session.id, session.username, 'TRANSACTION_CANCELLED', `Transação #${transactionId}`, 'Cancelada');

        return NextResponse.json({ success: true, message: 'Transação cancelada.' });
    } catch (error) {
        console.error('Cancel transaction error:', error);
        return NextResponse.json({ error: 'Falha ao cancelar transação.' }, { status: 500 });
    }
}
