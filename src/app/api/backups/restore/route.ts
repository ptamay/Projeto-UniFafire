import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';

// TASK-068 (Sprint 21 · Etapa 4 do ADR-012) — restauração por cópia de arquivo,
// DESATIVADA.
//
// A implementação anterior chamava `resetConnection()`: fechava o banco, copiava
// o arquivo `.db` escolhido por cima do `keys.db` e reabria. No Postgres não há
// arquivo para trocar, e em execução serverless não há processo longo para
// reabrir. Não é uma conversão difícil — é uma operação que deixa de existir.
//
// O ADR-012 registra este item explicitamente: *"o endpoint atual deixa de
// funcionar e precisa ser **desativado, não deixado quebrado**"*. O desenho
// definitivo — backup gerenciado do provedor com verificação por job agendado,
// mantendo RPO 24h / RTO 4h da §4.3 — é a **TASK-078**, na Etapa 7.
//
// Até lá a rota responde 503 e não toca em nada. Um ADMIN que clicar em
// "restaurar" precisa saber que não restaurou; a alternativa seria um sucesso
// mentiroso sobre um backup que não aconteceu, no exato ponto do sistema em que
// isso custa mais caro.
//
// A verificação de sessão e o 403 para quem não é ADMIN continuam ANTES da
// recusa (§3.5): o que está indisponível é a operação, não o controle de acesso.

export async function POST() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const session = await verifySession(sessionCookie.value);
    if (!session || session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Tentativa de restauração é evento de auditoria mesmo recusada: é operação
    // destrutiva por natureza, e saber que alguém tentou importa (§3.5).
    logAction(
        session.id,
        session.username,
        'RESTORE_BACKUP_INDISPONIVEL',
        'backups/restore',
        'Restauração por cópia de arquivo desativada na migração para Postgres (TASK-068); substituta na TASK-078.',
    );

    return NextResponse.json(
        {
            error:
                'Restauração por cópia de arquivo foi desativada na migração para Postgres. ' +
                'O backup passa a ser gerenciado pelo provedor do banco, com restauração pelo ' +
                'painel dele; a substituta no sistema é a TASK-078 (Etapa 7 do ADR-012). ' +
                'Nenhum dado foi alterado.',
        },
        { status: 503 },
    );
}
