import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';
import {
    ACOES, DisparoRecusado, configuracaoDoDisparo, dispararBackup, estadoDoBackupManual,
} from '@/lib/backup-manual';

// TASK-114 (ADR-024, decisão 3) — backup manual pela tela.
//
// GET  → o estado: configurado? há pedido pendente? quem pediu e quando.
// POST → pede ao GitHub que rode `.github/workflows/backup.yml` agora (202).
//
// Só ADMIN (§3.2): o disparo gera um dump com a PII de todo mundo e usa uma credencial
// da aplicação no GitHub. Cada pedido — e cada recusa do GitHub — vai para a trilha.
//
// O 503 de "não configurado" NÃO é o 503 perpétuo que a TASK-082 removeu: aquele
// respondia a um botão que estava sempre na tela. Este só é alcançável chamando a API à
// mão — a tela não mostra o botão enquanto o estado disser `configurado: false`.

async function sessaoAdmin() {
    const cookie = (await cookies()).get('session');
    if (!cookie) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
    const session = await verifySession(cookie.value);
    if (!session) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
    if (session.role !== 'ADMIN') return { erro: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
    return { session };
}

export async function GET() {
    const { erro } = await sessaoAdmin();
    if (erro) return erro;
    try {
        return NextResponse.json(await estadoDoBackupManual());
    } catch (e) {
        console.error('[Backup manual] Falha ao ler o estado:', e);
        return NextResponse.json({ error: 'Não foi possível ler o estado do backup manual.' }, { status: 500 });
    }
}

export async function POST() {
    const { erro, session } = await sessaoAdmin();
    if (erro) return erro;
    const usuarioId = session!.id as number;
    const usuario = session!.username as string;

    const config = configuracaoDoDisparo();
    if (!config) {
        return NextResponse.json(
            { error: 'Backup manual não configurado: faltam BACKUP_DISPARO_TOKEN e BACKUP_DISPARO_REPO (runbook §6.3).' },
            { status: 503 },
        );
    }

    try {
        const estado = await estadoDoBackupManual();
        if (estado.pendente) {
            return NextResponse.json(
                { error: 'Já há um backup pedido que ainda não terminou. Ele aparece em "Último backup" quando acabar.', ...estado },
                { status: 409 },
            );
        }

        try {
            await dispararBackup(config);
        } catch (e) {
            if (!(e instanceof DisparoRecusado)) throw e;
            // Só o status vai para o log e para a trilha — nunca o token, nem o corpo do GitHub.
            console.error(`[Backup manual] GitHub recusou o disparo: HTTP ${e.status ?? 'sem resposta'}`);
            await logAction(usuarioId, usuario, ACOES.falhou, 'backup', `GitHub: HTTP ${e.status ?? 'sem resposta'}`);
            return NextResponse.json({ error: e.message }, { status: 502 });
        }

        await logAction(usuarioId, usuario, ACOES.solicitado, 'backup', 'workflow backup.yml disparado na main');
        return NextResponse.json(await estadoDoBackupManual(), { status: 202 });
    } catch (e) {
        console.error('[Backup manual] Falha ao pedir o backup:', e instanceof Error ? e.message : 'erro desconhecido');
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
