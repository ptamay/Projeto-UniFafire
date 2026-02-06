import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import KeysClient from '../components/KeysClient';

function getData() {
    const keys = db.prepare("SELECT * FROM keys ORDER BY name ASC").all();
    return { keys };
}

export default async function KeysPage() {
    const sessionCookie = (await cookies()).get('session');

    if (!sessionCookie) {
        redirect('/login');
    }

    let session;
    try {
        session = JSON.parse(sessionCookie.value);
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(session.id);
        if (!user) {
            redirect('/login');
        }
    } catch (e) {
        redirect('/login');
    }
    const { keys } = getData();
    const isAdmin = session.role === 'ADMIN';

    return (
        <main>
            <KeysClient initialKeys={keys as any} isAdmin={isAdmin} />
        </main>
    );
}
