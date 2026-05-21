import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import db from '@/lib/db';
import KeysClient from '../components/KeysClient';

export default async function KeysPage() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) redirect('/login');

    let session;
    try {
        session = await verifySession(sessionCookie.value);
        if (!session) throw new Error();
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(session.id);
        if (!user) redirect('/login');
    } catch { redirect('/login'); }

    const keys = db.prepare("SELECT * FROM keys WHERE active = 1 ORDER BY CASE WHEN status = 'in_use' THEN 0 ELSE 1 END, name ASC").all();

    return (
        <main>
            <KeysClient initialKeys={keys as any} userRole={session.role} username={session.username} />
        </main>
    );
}
