import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { listarLogs } from '@/lib/logs-query';
import LogsClient from './LogsClient';

export default async function LogsPage() {
    const session = (await cookies()).get('session');

    if (!session) {
        redirect('/login');
    }

    // JSX e redirect() ficam fora do try: NEXT_REDIRECT lançado dentro do try
    // era engolido pelo catch, mandando não-admins para /login em vez de /.
    let sessionData: Awaited<ReturnType<typeof verifySession>> = null;
    try {
        sessionData = await verifySession(session.value);
    } catch {
        sessionData = null;
    }
    if (!sessionData) redirect('/login');
    if (sessionData.role !== 'ADMIN' && sessionData.role !== 'GESTOR') redirect('/');
    // TASK-131: a primeira página da trilha vai junto — a tela não abre em "Carregando…".
    // Mesma consulta e mesmos padrões da tela (50 por página, sem filtro).
    const logsIniciais = await listarLogs({ page: 1, limit: 50 });
    return <LogsClient logsIniciais={logsIniciais} />;
}
