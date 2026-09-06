import { NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/pg';
import bcrypt from 'bcryptjs';
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

        const user = await queryOne<UserAuthRow>('SELECT * FROM users WHERE id = $1', [userId]);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const match = await bcrypt.compare(currentPassword, user.password_hash);
        if (!match) {
            return NextResponse.json({ error: 'Incorrect current password' }, { status: 401 });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await execute('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Change password error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
