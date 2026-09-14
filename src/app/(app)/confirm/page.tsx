import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { listarPendencias, PAPEIS_QUE_VEEM_TODAS_AS_PENDENCIAS } from '@/lib/pendencias';
import ConfirmClient from './ConfirmClient';

// TASK-131 (emenda do ADR-029) — a tela chega com as pendências, sem cartões cinzas.
//
// /confirm é de TODOS os papéis: não bloqueia, ESCOPA. Quem opera o balcão recebe todas as
// pendências; os demais, só aquelas em que são destinatários ou o porteiro que iniciou. A
// restrição é o id da sessão passado como teto (§3.2, mesmo padrão do Histórico).
export default async function ConfirmPage() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) redirect('/login');

    let session;
    try {
        session = await verifySession(sessionCookie.value);
        if (!session) throw new Error();
    } catch { redirect('/login'); }

    const restritoAoUsuarioId = PAPEIS_QUE_VEEM_TODAS_AS_PENDENCIAS.includes(session.role) ? undefined : session.id;
    const pendenciasIniciais = await listarPendencias({ restritoAoUsuarioId });

    return <ConfirmClient userRole={session.role} userId={session.id} pendenciasIniciais={pendenciasIniciais} />;
}
