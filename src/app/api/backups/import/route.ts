import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import path from 'path';
import fs from 'fs';
import { resetConnection } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
        }

        // Validate file (should be a .db file)
        if (!file.name.endsWith('.db')) {
            return NextResponse.json({ error: 'Formato inválido. Envie um arquivo .db' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const dbPath = path.resolve(process.cwd(), 'keys.db');

        console.log(`[IMPORT SYSTEM] Iniciando importação do banco solicitada pelo Admin: ${session.username}.`);

        // Executar importação sincronamente enquanto o banco atual estiver fechado
        resetConnection(() => {
            fs.writeFileSync(dbPath, buffer);
            console.log(`[IMPORT SYSTEM] Arquivo físico substituído pelo arquivo enviado.`);
        });

        // Registrar a ação do administrador
        const { logAction } = require('@/lib/logger');
        logAction(session.id, session.username, 'IMPORT_DATABASE', file.name, 'Banco de dados importado manualmente pelo upload de arquivo.');

        return NextResponse.json({ success: true, message: 'Banco de dados importado com sucesso.' });
    } catch (e) {
        console.error('[IMPORT SYSTEM ERROR]', e);
        return NextResponse.json({ error: 'Erro crítico ao importar o banco de dados.' }, { status: 500 });
    }
}
