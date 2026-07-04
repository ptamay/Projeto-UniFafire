import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

export async function GET() {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Conta a frequência de retiradas de chaves pelo usuário atual
        const frequentKeys = db.prepare(`
            SELECT k.id, COUNT(h.id) as frequency
            FROM keys k
            JOIN history h ON k.id = h.key_id
            WHERE h.user_id = ? AND h.action = 'withdraw' AND k.active = 1
            GROUP BY k.id
            ORDER BY frequency DESC
            LIMIT 5
        `).all(session.id) as { id: number, frequency: number }[];

        return NextResponse.json(frequentKeys.map(k => k.id));
    } catch (error) {
        console.error('Frequent keys error:', error);
        return NextResponse.json({ error: 'Failed to fetch frequent keys' }, { status: 500 });
    }
}
