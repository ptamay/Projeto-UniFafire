import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { logAction } from '@/lib/logger';

async function getUser() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) return null;
    try {
        return JSON.parse(sessionCookie.value);
    } catch {
        return null;
    }
}

// Get all employees
export async function GET() {
    try {
        const employees = db.prepare('SELECT * FROM employees').all();
        return NextResponse.json(employees);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
    }
}

// Create a new employee
export async function POST(request: Request) {
    try {
        const user = await getUser();
        const body = await request.json();
        const { name, role } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const stmt = db.prepare('INSERT INTO employees (name, role) VALUES (?, ?)');
        const info = stmt.run(name, role || '');

        if (user) {
            logAction(user.id, user.username, 'CREATE_EMPLOYEE', name, `Role: ${role || 'None'}`);
        }

        return NextResponse.json({ id: info.lastInsertRowid, name, role });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 });
    }
}

// Update employee
export async function PUT(request: Request) {
    try {
        const user = await getUser();
        const body = await request.json();
        const { id, name, role } = body;

        if (!id || !name) {
            return NextResponse.json({ error: 'ID and Name are required' }, { status: 400 });
        }

        const currentEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as any;

        const stmt = db.prepare('UPDATE employees SET name = ?, role = ? WHERE id = ?');
        const info = stmt.run(name, role || '', id);

        if (info.changes === 0) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        if (user && currentEmployee) {
            const details = `Changed from: ${currentEmployee.name} (${currentEmployee.role}) to ${name} (${role})`;
            logAction(user.id, user.username, 'UPDATE_EMPLOYEE', name, details);
        }

        return NextResponse.json({ success: true, id, name, role });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 });
    }
}

// Delete employee
export async function DELETE(request: Request) {
    try {
        const user = await getUser();
        const body = await request.json();
        const { id } = body;

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        const employee = db.prepare('SELECT name, role FROM employees WHERE id = ?').get(id) as any;

        // Check if employee has keys in use (now checking keys table directly)
        const activeKey = db.prepare('SELECT id FROM keys WHERE employee_id = ?').get(id);

        if (activeKey) {
            return NextResponse.json({ error: 'Não é possível apagar: Funcionário possui chaves em uso.' }, { status: 400 });
        }

        const stmt = db.prepare('DELETE FROM employees WHERE id = ?');
        const info = stmt.run(id);

        if (info.changes === 0) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        if (user && employee) {
            logAction(user.id, user.username, 'DELETE_EMPLOYEE', employee.name, `Deleted employee ${employee.name} - ${employee.role}`);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete employee error:', error);
        return NextResponse.json({ error: 'Failed to delete employee' }, { status: 500 });
    }
}
