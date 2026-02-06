import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('session');

        if (!sessionCookie) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const session = JSON.parse(sessionCookie.value);

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
