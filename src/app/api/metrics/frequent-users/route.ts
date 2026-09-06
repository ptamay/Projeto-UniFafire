import { NextResponse } from 'next/server';
import { query } from '@/lib/pg';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

export async function GET(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // TASK-085 (ADR-014) — esta checagem não existia, e a rota devolvia a
        // qualquer usuário autenticado (inclusive ALUNO) o nome, o username, o
        // papel e a frequência de retirada dos cinco maiores usuários de uma
        // chave. `keyId` é sequencial: enumerar dava o mapa de quem frequenta
        // qual sala.
        //
        // O consumidor único já chamava a rota dentro de `if (isPorteiroOrAdmin)`
        // — mas isso é gating de interface, e a §3.2 é literal: "checagem só no
        // client = vulnerabilidade, não feature". O mesmo conjunto de papéis das
        // rotas irmãs `business` e `frequent-keys`.
        if (!['ADMIN', 'GESTOR', 'PORTEIRO'].includes(session.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const url = new URL(request.url);
        const keyIdStr = url.searchParams.get('keyId');
        
        if (!keyIdStr) {
            return NextResponse.json({ error: 'keyId is required' }, { status: 400 });
        }
        
        const keyId = parseInt(keyIdStr, 10);
        if (isNaN(keyId)) return NextResponse.json({ error: 'Invalid keyId' }, { status: 400 });

        // Conta a frequência de retiradas desta chave por usuário, nos últimos meses ou em todo histórico
        const frequentUsers = await query(`
            SELECT u.id, u.username as name, u.role, u.username, u.full_name, COUNT(h.id) as frequency
            FROM users u
            JOIN history h ON u.id = h.user_id
            WHERE h.key_id = $1 AND h.action = 'withdraw' AND u.active
            GROUP BY u.id
            ORDER BY frequency DESC
            LIMIT 5
        `, [keyId]);

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
