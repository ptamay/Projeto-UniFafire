import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import UsersClient from './UsersClient';

export default async function UsersPage() {
    const sessionCookie = (await cookies()).get('session');

    if (!sessionCookie) {
        redirect('/login');
    }

    try {
        const session = await verifySession(sessionCookie.value);
        if (!session || (session.role !== 'ADMIN' && session.role !== 'GESTOR')) {
            redirect('/');
        }
        return <UsersClient userRole={session.role} username={session.username} />;
    } catch {
        redirect('/login');
    }
}
