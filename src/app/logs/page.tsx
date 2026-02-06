import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LogsClient from './LogsClient';

export default async function LogsPage() {
    const session = (await cookies()).get('session');

    if (!session) {
        redirect('/login');
    }

    try {
        const sessionData = JSON.parse(session.value);
        if (sessionData.role !== 'ADMIN') {
            redirect('/');
        }
    } catch {
        redirect('/login');
    }

    return <LogsClient />;
}
