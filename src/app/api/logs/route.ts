import { NextResponse } from 'next/server';
import { listarLogs } from '@/lib/logs-query';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

export async function GET(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        let session;
        try {
            session = await verifySession(sessionCookie.value);
            if (!session) throw new Error('Invalid session');
        } catch {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        if (session.role !== 'ADMIN' && session.role !== 'GESTOR') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const searchParams = new URL(request.url).searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const search = searchParams.get('search') || '';
        const date = searchParams.get('date') || '';
        const month = searchParams.get('month') || '';
        const hour = searchParams.get('hour') || '';
        const category = searchParams.get('category') || 'all'; 

        // TASK-131: a consulta mora em `src/lib/logs-query.ts`, a mesma que a pagina /logs usa.
        return NextResponse.json(await listarLogs({ page, limit, search, date, month, hour, category }));
    } catch (error) {
        console.error('Fetch logs error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
