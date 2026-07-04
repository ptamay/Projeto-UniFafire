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

    const success = createBackup();
    if (success) {
        return NextResponse.json({ success: true, message: 'Backup gerado com sucesso.' });
    } else {
        return NextResponse.json({ error: 'Falha ao gravar backup manual.' }, { status: 500 });
    }
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
