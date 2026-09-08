import { NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/pg';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';
import { gerarCodigoDeAcesso, expiracaoDoCodigo, VALIDADE_DO_CODIGO_MINUTOS } from '@/lib/reset-code';

export async function POST(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        
        const session = await verifySession(sessionCookie.value);
        if (!session || (session.role !== 'ADMIN' && session.role !== 'GESTOR')) {
            return NextResponse.json({ error: 'Acesso negado. Apenas administradores e gestores.' }, { status: 403 });
        }

        const body = await request.json();
        // Accept both userId (from client) and targetUserId (legacy/consistency)
        const targetUserId = body.userId || body.targetUserId;
        // `newPassword` saiu daqui (TASK-093). A rota aceitava o ADMIN DEFINIR a
        // senha de outra pessoa — nenhum consumidor mandava esse campo, e sob o
        // ADR-017 ele é a mesma falha por outro caminho: alguém além do dono
        // conhecendo a senha do dono.

        if (!targetUserId) {
            return NextResponse.json({ error: 'ID do usuário é obrigatório' }, { status: 400 });
        }

        // Get target user username for logging
        const targetUser = await queryOne<{ username: string }>(
            'SELECT username FROM users WHERE id = $1', [targetUserId],
        );
        if (!targetUser) {
            return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
        }

        // TASK-093 (ADR-017) — emite um CÓDIGO DE USO ÚNICO em vez de gravar a
        // senha padrão compartilhada.
        //
        // A senha antiga vai a NULL de propósito. Antes, o reset a SUBSTITUÍA por
        // um valor que ADMIN e GESTOR conhecem e que nunca muda — a conta ficava
        // aberta a quem soubesse aquele valor, na janela até o primeiro acesso da
        // vítima. Agora não existe senha nenhuma até a pessoa definir a dela.
        const codigo = gerarCodigoDeAcesso();
        await execute(
            `UPDATE users SET password_hash = NULL, reset_code_hash = $1,
             reset_code_expires_at = $2, requires_password_change = true WHERE id = $3`,
            [await bcrypt.hash(codigo, 10), expiracaoDoCodigo(), targetUserId],
        );

        // A trilha registra QUE houve reset e por quem — nunca o código. A §7.1
        // proíbe senha em log, e o código entra na mesma proibição por decisão
        // explícita do ADR-017: ele não é senha, e sem dizer isso alguém concluiria
        // que está liberado. `action_logs` é imutável — o que entrar ali fica.
        await logAction(session.id, session.username, 'RESET_PASSWORD', targetUser.username, `Emitido código de acesso para ${targetUser.username}`);

        return NextResponse.json({
            success: true,
            // Única vez que este valor existe fora do hash. Não é senha: é bilhete
            // de entrada, de uso único, e é isso que mantém a §2.1 intacta.
            codigoDeAcesso: codigo,
            validadeMinutos: VALIDADE_DO_CODIGO_MINUTOS,
            message: `Código de acesso gerado para ${targetUser.username}. Vale por ${VALIDADE_DO_CODIGO_MINUTOS} minutos e serve uma vez só.`,
        });
    } catch (error) {
        console.error('Reset password error:', error);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
