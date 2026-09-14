import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { listarPendencias, PAPEIS_QUE_VEEM_TODAS_AS_PENDENCIAS } from '@/lib/pendencias';

// GET /api/transactions/pending — retorna transações pendentes para o usuário logado.
//
// TASK-131: a consulta mora em `src/lib/pendencias.ts`, a mesma que a página /confirm usa na
// abertura. Quem opera o balcão vê todas; os demais, só as em que são destinatários ou o
// porteiro que iniciou — restrição pelo id da SESSÃO, como teto.
export async function GET() {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const restritoAoUsuarioId = PAPEIS_QUE_VEEM_TODAS_AS_PENDENCIAS.includes(session.role) ? undefined : session.id;
        return NextResponse.json(await listarPendencias({ restritoAoUsuarioId }));
    } catch (error) {
        console.error('Pending transactions error:', error);
        return NextResponse.json({ error: 'Failed to fetch pending transactions' }, { status: 500 });
    }
}
