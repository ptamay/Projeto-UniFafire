import { NextResponse } from 'next/server';
import { query } from '@/lib/pg';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

export async function GET() {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // REQ-029c: a portaria (ADMIN/GESTOR/PORTEIRO) opera para todos, então
        // "frequente" = chaves mais movimentadas GLOBALMENTE. O usuário comum
        // recebe as próprias. Prepared statements em ambos os ramos.
        const isPortaria = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(session.role);
        const frequentKeys = isPortaria
            ? await query<{ id: number; frequency: string }>(`
                SELECT k.id, COUNT(h.id) as frequency
                FROM keys k
                JOIN history h ON k.id = h.key_id
                WHERE h.action = 'withdraw' AND k.active
                GROUP BY k.id
                ORDER BY frequency DESC
                LIMIT 5
            `)
            : await query<{ id: number; frequency: string }>(`
                SELECT k.id, COUNT(h.id) as frequency
                FROM keys k
                JOIN history h ON k.id = h.key_id
                WHERE h.user_id = $1 AND h.action = 'withdraw' AND k.active
                GROUP BY k.id
                ORDER BY frequency DESC
                LIMIT 5
            `, [session.id]);

        return NextResponse.json(frequentKeys.map(k => k.id));
    } catch (error) {
        console.error('Frequent keys error:', error);
        return NextResponse.json({ error: 'Failed to fetch frequent keys' }, { status: 500 });
    }
}
