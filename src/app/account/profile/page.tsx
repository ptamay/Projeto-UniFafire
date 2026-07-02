import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import db from '@/lib/db';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) redirect('/login');

    let session;
    try {
        session = await verifySession(sessionCookie.value);
        if (!session) throw new Error();
    } catch { redirect('/login'); }

    const stmt = db.prepare('SELECT username, role, full_name, matricula, phone FROM users WHERE id = ?');
    const user = stmt.get(session.id);

    if (!user) redirect('/login');

    return (
        <ProfileClient 
            userRole={session.role} 
            username={session.username} 
            initialData={user} 
        />
    );
}
