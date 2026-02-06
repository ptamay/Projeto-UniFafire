import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import HistoryClient from './HistoryClient';

export default async function HistoryPage() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie) redirect('/login');

  let isAdmin = false;
  try {
    const session = JSON.parse(sessionCookie.value);
    isAdmin = session.role === 'ADMIN';
  } catch {
    redirect('/login');
  }

  // Fetch history with joins
  // We cast the result to any[] because better-sqlite3 types might not be perfectly inferred here without a schema interface
  const history = db.prepare(`
    SELECT h.id, h.action, h.timestamp, 
           k.name as key_name, k.room,
           e.name as employee_name
    FROM history h
    LEFT JOIN keys k ON h.key_id = k.id
    LEFT JOIN employees e ON h.employee_id = e.id
    ORDER BY h.timestamp DESC
    LIMIT 100
  `).all() as any[];

  return <HistoryClient history={history} isAdmin={isAdmin} />;
}
