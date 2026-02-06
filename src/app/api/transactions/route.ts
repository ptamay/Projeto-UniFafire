import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, keyId, employeeId } = body;

        // action: 'withdraw' | 'return'
        if (!action || !keyId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const key = db.prepare('SELECT * FROM keys WHERE id = ?').get(keyId) as any;
        if (!key) {
            return NextResponse.json({ error: 'Key not found' }, { status: 404 });
        }

        if (action === 'withdraw') {
            if (!employeeId) return NextResponse.json({ error: 'Employee required for withdrawal' }, { status: 400 });
            if (key.status !== 'available') return NextResponse.json({ error: 'Key is already in use' }, { status: 400 });

            // Transaction
            const trans = db.transaction(() => {
                db.prepare("UPDATE keys SET status = 'in_use', employee_id = ? WHERE id = ?").run(employeeId, keyId);
                db.prepare("INSERT INTO history (key_id, employee_id, action) VALUES (?, ?, 'withdraw')").run(keyId, employeeId);
            });
            trans();

        } else if (action === 'return') {
            if (key.status !== 'in_use') return NextResponse.json({ error: 'Key is not in use' }, { status: 400 });

            const trans = db.transaction(() => {
                // Determine who had it from keys table or history? 
                // Since we now store employee_id on keys, use that or the passed one.
                // For history log consistency, if employeeId is passed use it, otherwise use the one on the key?
                // The prompt for 'return' usually doesn't ask for employee, just 'return key'.
                // So let's use the current holder from the key if available.

                const currentHolder = key.employee_id;

                db.prepare("UPDATE keys SET status = 'available', employee_id = NULL WHERE id = ?").run(keyId);
                db.prepare("INSERT INTO history (key_id, employee_id, action) VALUES (?, ?, 'return')").run(keyId, employeeId || currentHolder || null);
            });
            trans();

        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Transaction error:', error);
        return NextResponse.json({ error: 'Transaction failed' }, { status: 500 });
    }
}
