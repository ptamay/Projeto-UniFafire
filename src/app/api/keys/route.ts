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

// Get all keys
export async function GET() {
    try {
        const keys = db.prepare(`
            SELECT k.*, e.name as employee_name, e.role as employee_role
            FROM keys k 
            LEFT JOIN employees e ON k.employee_id = e.id
        `).all();
        return NextResponse.json(keys);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500 });
    }
}

// Create a new key
export async function POST(request: Request) {
    try {
        const user = await getUser();
        const body = await request.json();
        const { name, room } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        // Check for duplicates
        const existing = db.prepare('SELECT id FROM keys WHERE name = ?').get(name);
        if (existing) {
            return NextResponse.json({ error: 'Já existe uma chave com este nome.' }, { status: 400 });
        }

        const stmt = db.prepare('INSERT INTO keys (name, room) VALUES (?, ?)');
        const info = stmt.run(name, room || '');

        if (user) {
            logAction(user.id, user.username, 'CREATE_KEY', name, `Room: ${room || 'N/A'}`);
        }

        return NextResponse.json({ id: info.lastInsertRowid, name, room, status: 'available' });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create key' }, { status: 500 });
    }
}

// Update key
export async function PUT(request: Request) {
    try {
        const user = await getUser();
        const body = await request.json();
        const { id, name, room } = body;

        if (!id || !name) {
            return NextResponse.json({ error: 'ID and Name are required' }, { status: 400 });
        }

        const currentKey = db.prepare('SELECT * FROM keys WHERE id = ?').get(id) as any;

        const stmt = db.prepare('UPDATE keys SET name = ?, room = ? WHERE id = ?');
        const info = stmt.run(name, room || '', id);

        if (info.changes === 0) {
            return NextResponse.json({ error: 'Key not found' }, { status: 404 });
        }

        if (user && currentKey) {
            const details = `Changed from: ${currentKey.name} (${currentKey.room}) to ${name} (${room})`;
            logAction(user.id, user.username, 'UPDATE_KEY', name, details);
        }

        return NextResponse.json({ success: true, id, name, room });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update key' }, { status: 500 });
    }
}

// Delete key
export async function DELETE(request: Request) {
    try {
        const user = await getUser();
        const body = await request.json();
        const { id } = body;

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        const key = db.prepare('SELECT name, room, status FROM keys WHERE id = ?').get(id) as any;

        if (!key) return NextResponse.json({ error: 'Key not found' }, { status: 404 });

        if (key.status === 'in_use') {
            return NextResponse.json({ error: 'Não é possível apagar: Chave está em uso.' }, { status: 400 });
        }

        const stmt = db.prepare('DELETE FROM keys WHERE id = ?');
        stmt.run(id);

        if (user) {
            logAction(user.id, user.username, 'DELETE_KEY', key.name, `Deleted key ${key.name} - ${key.room}`);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete key' }, { status: 500 });
    }
}
