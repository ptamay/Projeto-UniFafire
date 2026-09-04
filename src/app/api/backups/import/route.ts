import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';

// TASK-068 (Sprint 21 · Etapa 4 do ADR-012) — importação de banco por upload,
// DESATIVADA.
//
// Mesma raiz da rota de restore: a implementação anterior chamava
// `resetConnection()` para gravar o arquivo enviado por cima do `keys.db`. Sem
// arquivo de banco e sem processo longo, a operação não tem equivalente.
//
// Esta rota era ainda mais perigosa que a de restore: aceitava um `.db`
// arbitrário vindo de upload e o promovia a banco de produção inteiro. Na
// internet pública (ADR-012 §0) isso é superfície que não se reabre sem desenho
// novo — o que é escopo da **TASK-078**, na Etapa 7.
//
// Recusa explícita, estado intocado, e o 403 para não-ADMIN preservado antes da
// recusa (§3.5).

export async function POST() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const session = await verifySession(sessionCookie.value);
    if (!session || session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    logAction(
        session.id,
        session.username,
        'IMPORT_DATABASE_INDISPONIVEL',
        'backups/import',
        'Importação de banco por upload desativada na migração para Postgres (TASK-068); substituta na TASK-078.',
    );

    return NextResponse.json(
        {
            error:
                'Importação de banco por upload de arquivo foi desativada na migração para ' +
                'Postgres. Promover um arquivo enviado a banco de produção não tem equivalente ' +
                'seguro na nova stack; o desenho substituto é a TASK-078 (Etapa 7 do ADR-012). ' +
                'Nenhum dado foi alterado.',
        },
        { status: 503 },
    );
}
