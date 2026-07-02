import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import SecurityClient from './SecurityClient';

export default async function SecurityPage() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) redirect('/login');

    let session;
    try {
        session = await verifySession(sessionCookie.value);
        if (!session) throw new Error();
    } catch { redirect('/login'); }

    return (
        <SecurityClient 
            userRole={session.role} 
            username={session.username} 
        />
    );
}
