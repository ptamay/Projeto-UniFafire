import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
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
    return <LogsClient userRole={sessionData.role} username={sessionData.username} />;
}
