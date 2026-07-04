import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import type { UserAuthRow } from '@/lib/db-rows';

export async function POST(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        
        const session = await verifySession(sessionCookie.value);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { userId, currentPassword, newPassword } = body;

        if (session.id !== userId && session.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        if (!currentPassword || !newPassword) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (newPassword.length < 6 || newPassword.length > 64) {
            return NextResponse.json({ error: 'New password must be between 6 and 64 characters' }, { status: 400 });
        }
        if (currentPassword.length > 64) {
            return NextResponse.json({ error: 'Invalid current password' }, { status: 400 });
        }

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserAuthRow | undefined;
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const match = await bcrypt.compare(currentPassword, user.password_hash);
        if (!match) {
            return NextResponse.json({ error: 'Incorrect current password' }, { status: 401 });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Change password error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
