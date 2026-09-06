import { NextResponse } from 'next/server';
import { getBackupRuns } from '@/lib/backup';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

// TASK-075 (Sprint 23 · Etapa 7b do ADR-012) — esta rota listava os arquivos
// `keys_backup_*.db` de um diretório em disco e permitia apagá-los.
//
// Os dois verbos morreram com o mecanismo:
//
// - **GET** passa a listar as EXECUÇÕES registradas em `backup_runs`. Os dumps
//   não estão mais aqui: vivem num repositório privado separado (TASK-078), e a
//   aplicação não tem — nem deve ter — credencial para lê-lo.
// - **DELETE** saiu na TASK-075. Não há arquivo local para apagar, e a trilha de
//   execuções é imutável por trigger no banco.
// - **POST saiu na TASK-082.** Ele recusava com 503 desde a TASK-070, e o botão
//   que o chamava saiu junto. Handler que responde 503 para sempre é pior que a
//   ausência dele: sugere capacidade em manutenção, quando a capacidade não
//   existe mais. Gerar backup é o job agendado — e, à mão, o `Run workflow`.

async function verifyAdmin() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) return false;
    try {
        const session = await verifySession(sessionCookie.value);
        return session && session.role === 'ADMIN';
    } catch {
        return false;
    }
}

// Listar as últimas execuções de backup
export async function GET() {
    const isAdmin = await verifyAdmin();
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        return NextResponse.json(await getBackupRuns(10));
    } catch (e) {
        console.error('[Backup] Falha ao listar execuções:', e);
        return NextResponse.json({ error: 'Não foi possível ler as execuções de backup.' }, { status: 503 });
    }
}
