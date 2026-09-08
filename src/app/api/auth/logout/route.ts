import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';
import { NOME_COOKIE_SESSAO } from '@/lib/session-cookie';

// TASK-095 (ADR-018) — a saída passa a entrar na trilha. REQ-010, §7.1.
//
// ## O que faltava
//
// Esta rota apagava o cookie e devolvia `{success:true}`. O login entra em
// `action_logs`; a saída não entrava — nem a manual, nem a automática das 18:30.
// Uma trilha que registra entradas e não saídas descreve metade do que aconteceu.
//
// ## O que isto destrava
//
// O relato de que "a sessão cai no celular" tinha três explicações compatíveis com
// os dados — logout das 18:30 numa aba aberta, cookies separados do PWA, e o idle
// de 24 h — e nenhuma verificável. Com a saída registrada, **um LOGIN_SUCCESS sem
// LOGOUT anterior passa a ser a assinatura** de expiração ou de outro aparelho.
//
// ## O que continua impossível
//
// Registrar a EXPIRAÇÃO no instante em que acontece. Quando o cookie morre, quem
// recusa é o `proxy.ts`, no Edge Runtime, sem acesso ao banco. E registrar do lado
// do cliente exigiria uma rota pública escrevendo na trilha imutável a partir de um
// token que já não vale — o que seria pior que a lacuna.

/** Os únicos motivos que existem. O cliente escolhe entre eles; não escreve texto.
 *
 *  `action_logs` é IMUTÁVEL (§7.1): o que entra ali fica. Aceitar o rótulo que o
 *  cliente mandar seria deixá-lo escrever numa tabela que ninguém pode limpar
 *  depois — e a lista fechada também garante que os relatórios possam AGRUPAR por
 *  motivo, em vez de comparar frases livres. */
const MOTIVOS: Record<string, string> = {
    manual: 'Usuário saiu pelo menu',
    automatico: 'Logout automático no horário configurado',
};

const MOTIVO_PADRAO = 'Saída sem motivo declarado';

export async function POST(request?: Request) {
    // A ordem importa: quem está saindo se identifica ANTES de o cookie ir embora.
    let sessao: Awaited<ReturnType<typeof verifySession>> = null;
    try {
        const cookie = (await cookies()).get(NOME_COOKIE_SESSAO);
        if (cookie) sessao = await verifySession(cookie.value);
    } catch {
        // Sessão ilegível é o caso normal de quem já expirou. Segue e sai.
    }

    let motivo = MOTIVO_PADRAO;
    try {
        const corpo = request ? await request.json() : null;
        motivo = MOTIVOS[corpo?.motivo] ?? MOTIVO_PADRAO;
    } catch {
        // Sair sem corpo continua valendo: o botão é mais importante que o rótulo.
    }

    (await cookies()).delete(NOME_COOKIE_SESSAO);

    // Só registra o que consegue atribuir. Uma saída anônima na trilha afirmaria o
    // que não se sabe — e, sendo imutável, para sempre.
    if (sessao) {
        try {
            await logAction(sessao.id, sessao.username, 'LOGOUT', 'System', motivo);
        } catch {
            // A trilha nunca pode impedir alguém de sair. O cookie já foi.
        }
    }

    return NextResponse.json({ success: true });
}
