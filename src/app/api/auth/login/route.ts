import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import { logAction } from '@/lib/logger';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
        }

        const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
        const user = stmt.get(username) as any; // simplified type

        if (!user) {
            logAction(null, username, 'LOGIN_FAILED', 'System', 'Invalid username');
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            logAction(user.id, username, 'LOGIN_FAILED', 'System', 'Invalid password');
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        // Set secure cookie with user info
        const sessionData = JSON.stringify({ id: user.id, username: user.username, role: user.role });
        (await cookies()).set('session', sessionData, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
        });

        logAction(user.id, user.username, 'LOGIN_SUCCESS', 'System', 'User logged in');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
