import { NextResponse } from 'next/server';
import { getAvailableBackups, createBackup, deleteBackup } from '@/lib/backup';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

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

// Listar backups
export async function GET() {
    const isAdmin = await verifyAdmin();
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const backups = getAvailableBackups();
    return NextResponse.json(backups);
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
    // 503, nao 500: nao e falha de execucao, e recusa deliberada enquanto a
    // TASK-078 nao entrega o substituto. Mesma resposta de backups/restore e
    // backups/import.
    return NextResponse.json({ error: r.error }, { status: 503 });
}

// Excluir Backup
export async function DELETE(request: Request) {
    const isAdmin = await verifyAdmin();
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { filename } = await request.json();
        if (!filename) return NextResponse.json({ error: 'Nome do arquivo é obrigatório' }, { status: 400 });

        const success = deleteBackup(filename);
        if (success) {
            return NextResponse.json({ success: true, message: 'Backup excluído com sucesso.' });
        } else {
            return NextResponse.json({ error: 'Arquivo não encontrado ou erro ao excluir.' }, { status: 404 });
        }
    } catch {
        return NextResponse.json({ error: 'Erro ao processar exclusão.' }, { status: 500 });
    }
}
