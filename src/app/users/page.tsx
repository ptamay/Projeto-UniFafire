import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import UsersClient from './UsersClient';

export default async function UsersPage() {
    const sessionCookie = (await cookies()).get('session');

    if (!sessionCookie) {
        redirect('/login');
    }

    // JSX e redirect() fora do try — NEXT_REDIRECT era engolido pelo catch.
    let session: Awaited<ReturnType<typeof verifySession>> = null;
    try {
        session = await verifySession(sessionCookie.value);
    } catch {
        session = null;
    }
    if (!session) redirect('/login');
    if (session.role !== 'ADMIN' && session.role !== 'GESTOR') redirect('/');
    return <UsersClient userRole={session.role} username={session.username} />;
}
