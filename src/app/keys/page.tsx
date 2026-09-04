import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { query as pgQuery, queryOne } from '@/lib/pg';
import KeysClient from '../components/KeysClient';
import type { KeyTableRow } from '@/lib/db-rows';

export default async function KeysPage() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) redirect('/login');

    let session;
    try {
        session = await verifySession(sessionCookie.value);
        if (!session) throw new Error();
        const user = await queryOne('SELECT id FROM users WHERE id = $1', [session.id]);
        if (!user) redirect('/login');
    } catch { redirect('/login'); }

    const rawKeys = await pgQuery<KeyTableRow>(
        "SELECT * FROM keys WHERE active ORDER BY CASE WHEN status = 'in_use' THEN 0 ELSE 1 END, lower(name) ASC",
    );
    const keys = rawKeys.map((k) => ({ ...k, room: k.room ?? '' }));

    return (
        <main>
            <KeysClient initialKeys={keys} userRole={session.role} username={session.username} />
        </main>
    );
}
