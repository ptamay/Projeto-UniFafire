import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import { logAction } from '@/lib/logger';

// Get all users
export async function GET() {
    try {
        const users = db.prepare('SELECT id, username, role FROM users').all();
        return NextResponse.json(users);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}

// Create user
export async function POST(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        let currentUser = null;
        if (sessionCookie) {
            try { currentUser = JSON.parse(sessionCookie.value); } catch { }
        }

        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
        }

        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
        }

        const hash = await bcrypt.hash(password, 10);
        const stmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
        const info = stmt.run(username, hash, 'USER');

        if (currentUser) {
            logAction(currentUser.id, currentUser.username, 'CREATE_USER', username, `New user created`);
        }

        return NextResponse.json({ id: info.lastInsertRowid, username, role: 'USER' });
    } catch (error) {
        console.error('Create user error:', error);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}

// Delete user
export async function DELETE(request: Request) {
    try {
        const body = await request.json();
        const { id } = body;

        if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

        // Check current session
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        let currentUserId;
        let currentUsername;
        try {
            const session = JSON.parse(sessionCookie.value);
            currentUserId = session.id;
            currentUsername = session.username;
        } catch (e) {
            return NextResponse.json({ error: 'Invalid session format' }, { status: 401 });
        }

        if (id === currentUserId) {
            return NextResponse.json({ error: 'Você não pode excluir a si mesmo.' }, { status: 403 });
        }

        const targetUserStmt = db.prepare('SELECT * FROM users WHERE id = ?');
        const targetUser = targetUserStmt.get(id) as any;

        if (!targetUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

        if (targetUser.role === 'ADMIN') {
            const adminCountStmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'");
            const result = adminCountStmt.get() as any;
            if (result.count <= 1) {
                return NextResponse.json({ error: 'Não é possível excluir o único administrador.' }, { status: 403 });
            }
        }

        const stmt = db.prepare('DELETE FROM users WHERE id = ?');
        const info = stmt.run(id);

        if (info.changes === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Action Log
        logAction(currentUserId, currentUsername, 'DELETE_USER', targetUser.username, `Deleted user ${targetUser.username} (${targetUser.role})`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
    }
}
