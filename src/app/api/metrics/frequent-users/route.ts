import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

export async function GET(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const url = new URL(request.url);
        const keyIdStr = url.searchParams.get('keyId');
        
        if (!keyIdStr) {
            return NextResponse.json({ error: 'keyId is required' }, { status: 400 });
        }
        
        const keyId = parseInt(keyIdStr, 10);
        if (isNaN(keyId)) return NextResponse.json({ error: 'Invalid keyId' }, { status: 400 });

        // Conta a frequência de retiradas desta chave por usuário, nos últimos meses ou em todo histórico
        const frequentUsers = db.prepare(`
            SELECT u.id, u.username as name, u.role, u.username, u.full_name, COUNT(h.id) as frequency
            FROM users u
            JOIN history h ON u.id = h.user_id
            WHERE h.key_id = ? AND h.action = 'withdraw' AND u.active = 1
            GROUP BY u.id
            ORDER BY frequency DESC
            LIMIT 5
        `).all(keyId);

        const result = frequentUsers.map((u) => {
            const user = u as { id: number, name: string, full_name: string, username: string, role: string, frequency: number };
            return {
                ...user,
                name: user.full_name || user.username
            };
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Frequent users error:', error);
        return NextResponse.json({ error: 'Failed to fetch frequent users' }, { status: 500 });
    }
}
