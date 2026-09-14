import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';
import { RestauracaoSchema } from '@/lib/schemas';
import { DisparoRecusado, configuracaoDoDisparo, dispararRestauracao } from '@/lib/backup-manual';
import { ACOES, backupsRestauraveis, estadoDaRestauracao } from '@/lib/restauracao';

// TASK-115 (ADR-024, decisão 4) — restaurar escolhendo da lista.
//
// GET  → o que dá para restaurar, e o estado do último pedido.
// POST → {arquivo, confirmacao: 'RESTAURAR'}: pede ao GitHub que rode
//        `.github/workflows/restaurar.yml` (202). Backup de segurança antes, só as tabelas
//        de negócio, trilha preservada — tudo lá.
//
// Endpoint destrutivo (§3.5): só ADMIN, confirmação explícita na tela, e entrada na trilha
// ANTES de executar — `RESTAURACAO_SOLICITADA` é gravada antes do disparo, e o workflow
// fecha o pedido com `BACKUP_RESTAURADO`, `RESTAURACAO_RECUSADA` ou `RESTAURACAO_FALHOU`.

async function sessaoAdmin() {
    const cookie = (await cookies()).get('session');
    if (!cookie) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
    const session = await verifySession(cookie.value);
    if (!session) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
    if (session.role !== 'ADMIN') return { erro: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
    return { session };
}

async function estadoCompleto() {
    return {
        configurado: configuracaoDoDisparo() !== null,
        ...(await backupsRestauraveis()),
        ...(await estadoDaRestauracao()),
    };
}

export async function GET() {
    const { erro } = await sessaoAdmin();
    if (erro) return erro;
    try {
        return NextResponse.json(await estadoCompleto());
    } catch (e) {
        console.error('[Restauração] Falha ao ler o estado:', e instanceof Error ? e.message : 'erro desconhecido');
        return NextResponse.json({ error: 'Não foi possível ler os backups restauráveis.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const { erro, session } = await sessaoAdmin();
    if (erro) return erro;
    const usuarioId = session!.id as number;
    const usuario = session!.username as string;

    let corpo: unknown;
    try { corpo = await req.json(); } catch { corpo = null; }
    const validado = RestauracaoSchema.safeParse(corpo);
    if (!validado.success) {
        return NextResponse.json({ error: validado.error.issues[0]?.message ?? 'Pedido inválido.' }, { status: 400 });
    }
    const { arquivo } = validado.data;

    const config = configuracaoDoDisparo();
    if (!config) {
        return NextResponse.json(
            { error: 'Restauração pela tela não configurada: faltam BACKUP_DISPARO_TOKEN e BACKUP_DISPARO_REPO (runbook §6.3).' },
            { status: 503 },
        );
    }

    try {
        if ((await estadoDaRestauracao()).pendente) {
            return NextResponse.json({ error: 'Já há uma restauração em andamento.' }, { status: 409 });
        }
        // O servidor confere de novo: o que o navegador manda não é prova de nada.
        const { restauraveis } = await backupsRestauraveis();
        if (!restauraveis.some(r => r.arquivo === arquivo)) {
            return NextResponse.json({ error: 'Este backup não está entre os restauráveis.' }, { status: 400 });
        }

        // §3.5 — a entrada na trilha ANTES de executar.
        await logAction(usuarioId, usuario, ACOES.solicitada, 'backup', arquivo);
        try {
            await dispararRestauracao(config, { arquivo, pedidoPor: usuario });
        } catch (e) {
            if (!(e instanceof DisparoRecusado)) throw e;
            console.error(`[Restauração] GitHub recusou o disparo: HTTP ${e.status ?? 'sem resposta'}`);
            // Fecha o pedido: sem isto, a tela diria "em andamento" por uma hora.
            await logAction(usuarioId, usuario, ACOES.falhou, 'backup', `${arquivo}; disparo recusado: HTTP ${e.status ?? 'sem resposta'}`);
            return NextResponse.json({ error: e.message }, { status: 502 });
        }
        return NextResponse.json(await estadoCompleto(), { status: 202 });
    } catch (e) {
        console.error('[Restauração] Falha ao pedir:', e instanceof Error ? e.message : 'erro desconhecido');
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
