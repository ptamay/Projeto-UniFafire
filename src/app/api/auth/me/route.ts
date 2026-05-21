import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('session');

        if (!sessionCookie) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const session = await verifySession(sessionCookie.value);
        if (!session) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        // Return safe user info
        return NextResponse.json({
            id: session.id,
            username: session.username,
            role: session.role
        });
    } catch (error) {
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
}
