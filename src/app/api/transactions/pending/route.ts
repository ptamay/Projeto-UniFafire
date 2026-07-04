import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

interface PendingTransactionRow {
    id: number;
    key_id: number;
    user_id: number;
    action: 'withdraw' | 'return';
    status: 'pending' | 'porteiro_confirmed';
    porteiro_id: number | null;
    porteiro_confirmed_at: string | null;
    user_confirmed_at: string | null;
    initiated_at: string;
    key_name: string | null;
    key_room: string | null;
    user_username: string | null;
    user_full_name: string | null;
    porteiro_username: string | null;
}

// GET /api/transactions/pending — retorna transações pendentes para o usuário logado
export async function GET() {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Porteiros veem todas as transações iniciadas por eles
        // Outros usuários veem apenas as que são para eles
        let transactions: PendingTransactionRow[];
        if (session.role === 'ADMIN' || session.role === 'GESTOR' || session.role === 'PORTEIRO') {
            transactions = db.prepare(`
                SELECT kt.*, 
                       k.name as key_name, k.room as key_room,
                       u.username as user_username, u.full_name as user_full_name,
                       p.username as porteiro_username
                FROM key_transactions kt
                LEFT JOIN keys k ON kt.key_id = k.id
                LEFT JOIN users u ON kt.user_id = u.id
                LEFT JOIN users p ON kt.porteiro_id = p.id
                WHERE kt.status IN ('pending', 'porteiro_confirmed')
                ORDER BY kt.initiated_at DESC
            `).all() as PendingTransactionRow[];
        } else {
            transactions = db.prepare(`
                SELECT kt.*,
                       k.name as key_name, k.room as key_room,
                       u.username as user_username, u.full_name as user_full_name,
                       p.username as porteiro_username
                FROM key_transactions kt
                LEFT JOIN keys k ON kt.key_id = k.id
                LEFT JOIN users u ON kt.user_id = u.id
                LEFT JOIN users p ON kt.porteiro_id = p.id
                WHERE kt.user_id = ? AND kt.status IN ('pending', 'porteiro_confirmed')
                ORDER BY kt.initiated_at DESC
            `).all(session.id) as PendingTransactionRow[];
        }

        return NextResponse.json(transactions);
    } catch (error) {
        console.error('Pending transactions error:', error);
        return NextResponse.json({ error: 'Failed to fetch pending transactions' }, { status: 500 });
    }
}
