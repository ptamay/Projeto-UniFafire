import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/pg';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { AUTO_LOGOUT_PADRAO, SENHA_PADRAO_RESET, lerAutoLogoutTime } from '@/lib/settings-policy';

// TASK-087 (ADR-014, achado 2) — este GET não tinha checagem NENHUMA e devolvia
// `defaultResetPassword` a qualquer usuário autenticado, inclusive ALUNO.
//
// Não era só exposição de configuração: em `login/route.ts`, com
// `requires_password_change` ligado, o login aceita a senha atual mais uma nova e
// troca na hora. Quem soubesse a senha padrão poderia, na janela entre um reset
// legítimo e o primeiro login da vítima, tomar a conta — herdando o papel dela.
//
// A correção OMITE O CAMPO em vez de recusar a requisição: `autoLogoutTime` é
// legítimo para todo papel (o `Sidebar` força o logout de todo mundo), e negar o
// GET quebraria um controle da §2 para proteger um campo que papéis baixos nunca
// leram.
//
// O handler passa a verificar a sessão por conta própria. Ele se apoiava só no
// proxy — que garante que HÁ sessão e, por desenho, não avalia papel. Uma rota
// que decide O QUE devolver com base no papel não pode delegar a outra camada
// saber quem está perguntando (§3.2).
export async function GET() {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Mesmo conjunto do POST e das rotas de reset: quem pode DEFINIR a senha
        // padrão é quem pode vê-la.
        const podeVerSenhaPadrao = session.role === 'ADMIN' || session.role === 'GESTOR';

        const settingsArr = await query<{ key: string; value: string }>('SELECT key, value FROM settings');

        const settingsMap: Record<string, string> = {};
        settingsArr.forEach(s => settingsMap[s.key] = s.value);

        // `lerAutoLogoutTime` recusa valor herdado invalido — o POST valida o
        // que entra, e nao o que ja estava la (TASK-083).
        return NextResponse.json({
            autoLogoutTime: lerAutoLogoutTime(settingsMap['auto_logout_time']),
            ...(podeVerSenhaPadrao
                ? { defaultResetPassword: settingsMap['default_reset_password'] || SENHA_PADRAO_RESET }
                : {}),
        });
    } catch {
        // A degradação também não pode vazar: sem saber o papel, devolve só o que
        // é público para qualquer sessão.
        return NextResponse.json({ autoLogoutTime: AUTO_LOGOUT_PADRAO });
    }
}

export async function POST(req: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const session = await verifySession(sessionCookie.value);
        if (!session || (session.role !== 'ADMIN' && session.role !== 'GESTOR')) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const body = await req.json();
        
        // Client dedicado: as quatro configuracoes entram juntas ou nenhuma
        // entra. ON CONFLICT DO UPDATE ja tem a mesma sintaxe nos dois dialetos —
        // o que muda e so o marcador de parametro.
        await withTransaction(async (tx) => {
            const gravar = (chave: string, valor: string) => tx.execute(
                `INSERT INTO settings (key, value) VALUES ($1, $2)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
                [chave, valor],
            );

            // Suporta 'time' (antigo) ou 'autoLogoutTime'
            const logoutTime = body.autoLogoutTime || body.time;
            if (logoutTime) await gravar('auto_logout_time', String(logoutTime));
            if (body.defaultResetPassword) await gravar('default_reset_password', String(body.defaultResetPassword));
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Error updating settings:', e);
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
}
