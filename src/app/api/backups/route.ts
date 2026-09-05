import { NextResponse } from 'next/server';
import { getBackupRuns, createBackup } from '@/lib/backup';
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
// - **DELETE** saiu. Não há arquivo local para apagar, e a trilha de execuções é
//   imutável por trigger no banco, pela mesma razão de `history` e `app_logs`:
//   registro de backup que pode ser reescrito não é evidência de nada. Um
//   handler que respondesse 404 para sempre seria pior do que a ausência dele —
//   sugeriria que existe algo a apagar.

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

// Forçar Geração de Backup Manual
export async function POST() {
    const isAdmin = await verifyAdmin();
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // `createBackup()` devolve um OBJETO, e objeto e sempre verdadeiro: o
    // `if (success)` que estava aqui entrava no ramo de sucesso mesmo com a
    // funcao recusando, e a rota respondia 200 "Backup gerado com sucesso"
    // sem ter gerado nada. Mesma classe do `if (checkLockout(...))` com Promise
    // que a Sprint 21 pegou no type-check — o valor certo, testado errado.
    const r = await createBackup();
    if (r.success) {
        return NextResponse.json({ success: true, message: 'Backup gerado com sucesso.' });
    }
    // 503, nao 500: nao e falha de execucao, e recusa deliberada. A geracao
    // agora e do job agendado (TASK-078), e a mensagem diz onde dispara-lo.
    return NextResponse.json({ error: r.error }, { status: 503 });
}
