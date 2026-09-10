import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { execute } from '@/lib/pg';
import { verifySession } from '@/lib/session';
import { NOME_COOKIE_SESSAO } from '@/lib/session-cookie';

// TASK-098 (ADR-018) — marca que a pessoa já viu o tutorial de primeiro acesso.
//
// ## Por que o corpo da requisição é ignorado
//
// A rota não recebe `userId`. Quem é marcado sai da SESSÃO, e só dela.
//
// Aceitar um id do corpo pareceria inofensivo — é um campo de onboarding, não uma
// permissão — e seria escrita numa linha alheia sem autorização: qualquer pessoa
// autenticada poderia marcar o tutorial de qualquer outra como visto, e essa outra
// nunca o veria. Um dano pequeno, mas sem nada que o impeça é um dano disponível.
//
// A §3.2 fala em verificar sessão E permissão. Aqui a permissão é trivial (todo
// usuário pode marcar o PRÓPRIO onboarding), e é exatamente por isso que o alvo
// não pode vir de fora.
export async function POST() {
    const cookie = (await cookies()).get(NOME_COOKIE_SESSAO);
    if (!cookie) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const sessao = await verifySession(cookie.value);
    if (!sessao) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // `COALESCE` preserva a PRIMEIRA vez: rever o tutorial pela tela de
    // Configurações não reescreve a data original, que é o que permite saber
    // quem viu qual versão do conteúdo.
    await execute(
        'UPDATE users SET onboarding_visto_em = COALESCE(onboarding_visto_em, now()) WHERE id = $1',
        [sessao.id],
    );

    return NextResponse.json({ success: true });
}
