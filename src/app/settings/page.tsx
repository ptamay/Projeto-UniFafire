import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) redirect('/login');
    try {
        const session = await verifySession(sessionCookie.value);
        if (!session || (session.role !== 'ADMIN' && session.role !== 'GESTOR')) redirect('/');
        return <SettingsClient userRole={session.role} username={session.username} />;
    } catch { redirect('/login'); }
}
