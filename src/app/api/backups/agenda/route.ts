import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { query, withTransaction } from '@/lib/pg';
import { logAction } from '@/lib/logger';
import { AgendaBackupSchema } from '@/lib/schemas';
import { lerAgenda, horariosDoDia, CHAVES } from '@/lib/agenda-backup.mjs';

// TASK-112 (ADR-024) — a agenda do backup: hora e vezes por dia.
//
// O workflow (`.github/workflows/backup.yml`) roda de hora em hora e consulta estas
// mesmas linhas por `db/agenda-backup.mjs`, com a mesma política
// (`src/lib/agenda-backup.mjs`). Por isso o controle volta à tela depois de o ADR-013
// o ter tirado: agora ele é obedecido.
//
// Só ADMIN (§3.2): a agenda decide quando dumps com a PII de todo mundo são gerados e
// guardados. É o mesmo papel que lê a confiabilidade do backup.

async function sessaoAdmin() {
    const cookie = (await cookies()).get('session');
    if (!cookie) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
    const session = await verifySession(cookie.value);
    if (!session) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
    if (session.role !== 'ADMIN') return { erro: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
    return { session };
}

async function agendaAtual() {
    const linhas = await query<{ key: string; value: string }>(
        'SELECT key, value FROM settings WHERE key IN ($1, $2)', [CHAVES.hora, CHAVES.vezes],
    );
    // Validada na LEITURA também: valor herdado inválido cai no padrão (Sprint 24).
    return lerAgenda(Object.fromEntries(linhas.map(l => [l.key, l.value])));
}

export async function GET() {
    const { erro } = await sessaoAdmin();
    if (erro) return erro;
    try {
        const agenda = await agendaAtual();
        return NextResponse.json({ ...agenda, horarios: horariosDoDia(agenda) });
    } catch (e) {
        console.error('[Backup] Falha ao ler a agenda:', e);
        return NextResponse.json({ error: 'Não foi possível ler a agenda.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const { erro, session } = await sessaoAdmin();
    if (erro) return erro;

    let corpo: unknown;
    try { corpo = await req.json(); } catch { corpo = null; }
    const validado = AgendaBackupSchema.safeParse(corpo);
    if (!validado.success) {
        return NextResponse.json({ error: validado.error.issues[0]?.message ?? 'Agenda inválida.' }, { status: 400 });
    }
    const { hora, vezes } = validado.data;

    try {
        const antes = await agendaAtual();
        // As duas linhas entram juntas ou nenhuma entra: meia agenda seria uma agenda
        // que ninguém configurou.
        await withTransaction(async (tx) => {
            for (const [chave, valor] of [[CHAVES.hora, hora], [CHAVES.vezes, vezes]] as const) {
                await tx.execute(
                    `INSERT INTO settings (key, value) VALUES ($1, $2)
                     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
                    [chave, String(valor)],
                );
            }
        });
        await logAction(session!.id as number, session!.username as string, 'BACKUP_AGENDA_ALTERADA', 'settings',
            `de ${horariosDoDia(antes).join('h, ')}h para ${horariosDoDia({ hora, vezes }).join('h, ')}h (Recife)`);

        return NextResponse.json({ hora, vezes, horarios: horariosDoDia({ hora, vezes }) });
    } catch (e) {
        console.error('[Backup] Falha ao gravar a agenda:', e);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
