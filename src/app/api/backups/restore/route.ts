import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import path from 'path';
import fs from 'fs';
import { resetConnection } from '@/lib/db';
import { logAction } from '@/lib/logger';

export async function POST(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await request.json();
        const filename = body.filename;
        if (!filename || typeof filename !== 'string') {
            return NextResponse.json({ error: 'Nome de arquivo inválido' }, { status: 400 });
        }

        const validBackupName = /^keys_backup_[A-Za-z0-9._-]+\.db$/.test(filename);
        if (!validBackupName || path.basename(filename) !== filename) {
            return NextResponse.json({ error: 'Nome de arquivo inválido' }, { status: 400 });
        }

        const backupsDir = path.resolve(process.cwd(), 'backups');
        const backupPath = path.resolve(backupsDir, filename);
        const dbPath = path.resolve(process.cwd(), 'keys.db');

        // Impedir Path Traversal
        const relativeBackupPath = path.relative(backupsDir, backupPath);
        if (relativeBackupPath.startsWith('..') || path.isAbsolute(relativeBackupPath)) {
            return NextResponse.json({ error: 'Nome de arquivo inválido' }, { status: 400 });
        }

        if (!fs.existsSync(backupPath)) {
            return NextResponse.json({ error: 'Arquivo de backup não encontrado' }, { status: 404 });
        }

        console.log(`[RESTORE SYSTEM] Iniciando restauração do banco '${filename}' solicitada pelo Admin: ${session.username}.`);

        // Executar cópia sincronamente enquanto o banco atual estiver fechado
        resetConnection(() => {
            fs.copyFileSync(backupPath, dbPath);
            console.log(`[RESTORE SYSTEM] Arquivo físico substituído por ${filename}.`);
        });

        // Registrar a ação do administrador após voltar o banco de dados principal reativado
        logAction(session.id, session.username, 'RESTORE_BACKUP', filename, 'Sistema inteiro restaurado a partir de um backup.');

        return NextResponse.json({ success: true, message: 'Restauração de sistema concluída com sucesso. O banco de dados agora está rodando na versão do backup escolhido.' });
    } catch (e) {
        console.error('[RESTORE SYSTEM ERROR]', e);
        return NextResponse.json({ error: 'Erro crítico ao restaurar o banco de dados.' }, { status: 500 });
    }
}
