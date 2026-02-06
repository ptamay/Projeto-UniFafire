import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import DashboardClient from './components/DashboardClient';

// Helper to fetch data on server
function getData() {
    const keys = db.prepare(`
        SELECT k.*, e.name as employee_name, e.role as employee_role 
        FROM keys k 
        LEFT JOIN employees e ON k.employee_id = e.id 
        ORDER BY k.name ASC
    `).all();
    const employees = db.prepare("SELECT * FROM employees ORDER BY name ASC").all();
    // We can also fetch history here if we want to pass it
    return { keys, employees };
}

export default async function Home() {
    const session = (await cookies()).get('session');

    if (!session) {
        redirect('/login');
    }

    let sessionData;
    try {
        sessionData = JSON.parse(session.value);
        // Validate user exists in DB
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(sessionData.id);
        if (!user) {
            redirect('/login');
        }
    } catch (e) {
        redirect('/login');
    }

    const { keys, employees } = getData();


    return (
        <main>
            <DashboardClient
                initialKeys={keys as any}
                initialEmployees={employees as any}
                userRole={sessionData.role || 'USER'}
                userId={sessionData.id}
            />
        </main>
    );
}
