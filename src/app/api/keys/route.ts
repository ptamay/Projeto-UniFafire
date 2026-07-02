import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { logAction } from '@/lib/logger';
import { verifySession } from '@/lib/session';
import { KeySchema } from '@/lib/schemas';

async function getUser() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) return null;
    try {
        return await verifySession(sessionCookie.value);
    } catch {
        return null;
    }
}

// Get all keys
export async function GET() {
    try {
        const user = await getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const rawKeys = db.prepare(`
            SELECT k.*, u.full_name as employee_name, u.role as employee_role,
                   (SELECT json_object(
                       'action', kt.action,
                       'user_confirmed', kt.user_confirmed_at IS NOT NULL,
                       'porteiro_confirmed', kt.porteiro_confirmed_at IS NOT NULL,
                       'user_name', u_kt.full_name,
                       'user_role', u_kt.role
                   )
                    FROM key_transactions kt
                    LEFT JOIN users u_kt ON kt.user_id = u_kt.id
                    WHERE kt.key_id = k.id AND kt.status IN ('pending', 'porteiro_confirmed')
                    LIMIT 1) as pending_info,
                   (SELECT completed_at 
                    FROM key_transactions 
                    WHERE key_id = k.id AND action = 'withdraw' AND status = 'completed' 
                    ORDER BY completed_at DESC LIMIT 1) as in_use_since
            FROM keys k 
            LEFT JOIN users u ON k.user_id = u.id
            WHERE k.active = 1
        `).all();

        const keys = rawKeys.map((k: any) => ({
            ...k,
            pending_info: k.pending_info ? JSON.parse(k.pending_info) : null
        }));

        return NextResponse.json(keys);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500 });
    }
}

// Create a new key
export async function POST(request: Request) {
    try {
        const user = await getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (user.role !== 'ADMIN' && user.role !== 'GESTOR' && user.role !== 'PORTEIRO') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await request.json();
        const parseResult = KeySchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json({ error: parseResult.error.issues[0]?.message || 'Inválido' }, { status: 400 });
        }
        
        const { name, room } = parseResult.data;

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
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (user.role !== 'ADMIN' && user.role !== 'GESTOR' && user.role !== 'PORTEIRO') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await request.json();
        const parseResult = KeySchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json({ error: parseResult.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
        }
        if (!parseResult.data.id) {
            return NextResponse.json({ error: 'ID required' }, { status: 400 });
        }
        
        const { id, name, room } = parseResult.data;

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
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (user.role !== 'ADMIN' && user.role !== 'GESTOR' && user.role !== 'PORTEIRO') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await request.json();
        const { id } = body;

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        const key = db.prepare('SELECT name, room, status FROM keys WHERE id = ?').get(id) as any;

        if (!key) return NextResponse.json({ error: 'Key not found' }, { status: 404 });

        if (key.status === 'in_use') {
            return NextResponse.json({ error: 'Não é possível apagar: Chave está em uso.' }, { status: 400 });
        }

        const stmt = db.prepare('UPDATE keys SET active = 0 WHERE id = ?');
        stmt.run(id);

        if (user) {
            logAction(user.id, user.username, 'DELETE_KEY', key.name, `Deleted key ${key.name} - ${key.room}`);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete key' }, { status: 500 });
    }
}
