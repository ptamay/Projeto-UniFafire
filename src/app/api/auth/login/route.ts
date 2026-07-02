import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import { logAction } from '@/lib/logger';
import { signSession } from '@/lib/session';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
        }

        const stmt = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1');
        const user = stmt.get(username) as any; // simplified type

        if (!user) {
            console.error(`Login error: Invalid username or inactive account: ${username}`);
            logAction(null, username, 'LOGIN_FAILED', 'System', 'Invalid username or inactive account');
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            console.error(`Login error: Invalid password for username: ${username}`);
            logAction(user.id, username, 'LOGIN_FAILED', 'System', 'Invalid password');
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        if (user.requires_password_change) {
            if (!body.newPassword) {
                return NextResponse.json({ requiresPasswordChange: true });
            }
            if (body.newPassword.length < 6) {
                return NextResponse.json({ error: 'A nova senha deve ter no mínimo 6 caracteres' }, { status: 400 });
            }
            const hashedNew = await bcrypt.hash(body.newPassword, 10);
            db.prepare('UPDATE users SET password_hash = ?, requires_password_change = 0 WHERE id = ?').run(hashedNew, user.id);
            logAction(user.id, user.username, 'CHANGE_PASSWORD', 'System', 'User changed default password on first login');
        }

        // Set secure cookie with user info
        const payloadParams = { id: user.id, username: user.username, role: user.role };
        const sessionToken = await signSession(payloadParams);

        (await cookies()).set('session', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 // 24 hours idle expiration
        });

        logAction(user.id, user.username, 'LOGIN_SUCCESS', 'System', 'User logged in');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
