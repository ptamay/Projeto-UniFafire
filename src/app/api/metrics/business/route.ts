import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { computeBusinessMetrics } from '@/lib/business-metrics';

// TASK-034 (REQ-006, spec §5) — métricas de negócio do dashboard. PORTEIRO+.
export async function GET() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let session;
    try {
        session = await verifySession(sessionCookie.value);
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'GESTOR', 'PORTEIRO'].includes(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(computeBusinessMetrics(30));
}
