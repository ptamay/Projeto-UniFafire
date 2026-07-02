import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { getBackupReliability } from '@/lib/backup';

// TASK-032 (REQ-009, spec §5) — métrica "confiabilidade do backup":
// % de dias (janela de 30 dias) com backup diário concluído e verificado. Alvo: 100%.
export async function GET() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const session = await verifySession(sessionCookie.value);
        if (!session || session.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(getBackupReliability(30));
}
