import { NextResponse } from 'next/server';
import os from 'os';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';

export async function GET() {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session || (session.role !== 'ADMIN' && session.role !== 'GESTOR')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const networkInterfaces = os.networkInterfaces();
        const ips: string[] = [];

        Object.keys(networkInterfaces).forEach((interfaceName) => {
            const interfaces = networkInterfaces[interfaceName];
            if (interfaces) {
                interfaces.forEach((iface) => {
                    // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                    if (iface.family === 'IPv4' && !iface.internal) {
                        ips.push(iface.address);
                    }
                });
            }
        });

        return NextResponse.json({
            ips: ips.length > 0 ? ips : ['127.0.0.1'],
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            uptime: os.uptime()
        });
    } catch (error) {
        console.error('Server info error:', error);
        return NextResponse.json({ error: 'Failed to fetch server info' }, { status: 500 });
    }
}
