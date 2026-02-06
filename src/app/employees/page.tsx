import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import EmployeesClient from '../components/EmployeesClient';

function getData() {
    const employees = db.prepare("SELECT * FROM employees ORDER BY name ASC").all();
    return { employees };
}

export default async function EmployeesPage() {
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
    const { employees } = getData();
    const isAdmin = session.role === 'ADMIN';

    return (
        <main>
            <EmployeesClient initialEmployees={employees as any} isAdmin={isAdmin} />
        </main>
    );
}
