import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { getBackupReliability } from '@/lib/backup';

// TASK-032 (REQ-009, spec §5) — métrica "confiabilidade do backup":
// % de dias (janela de 30 dias) com backup diário concluído e verificado. Alvo: 100%.
//
// TASK-075 (Sprint 23): a fonte passou a ser `backup_runs`. A autorização NÃO
// muda com a fonte — continua ADMIN, porque a resposta carrega a mensagem de
// erro da última execução, que pode nomear host e caminho do banco.
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

    try {
        return NextResponse.json(await getBackupReliability(30));
    } catch (e) {
        // Falha de leitura não pode virar "nenhuma execução": as duas coisas
        // aparecem iguais na tela e só uma delas significa que o backup parou.
        console.error('[Backup] Falha ao ler a confiabilidade:', e);
        return NextResponse.json(
            { error: 'Não foi possível ler o registro de execuções de backup.' },
            { status: 503 },
        );
    }
}
