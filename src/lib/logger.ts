import db from '@/lib/db';
import { headers } from 'next/headers';

export async function logAction(userId: number | null, username: string | undefined | null, action: string, target: string, details?: string) {
    try {
        let ipAddress = 'Unknown';
        try {
            const headersList = await headers();
            const forwardedFor = headersList.get('x-forwarded-for');
            const realIp = headersList.get('x-real-ip');
            
            if (forwardedFor) {
                ipAddress = forwardedFor.split(',')[0].trim();
            } else if (realIp) {
                ipAddress = realIp.trim();
            } else {
                ipAddress = '127.0.0.1'; 
            }
            
            // Clean up IPv6 localhost if present
            if (ipAddress === '::1' || ipAddress === '::ffff:127.0.0.1') {
                ipAddress = '127.0.0.1';
            }
        } catch (e) {
            // Not in a request context (e.g. build time or background job)
            ipAddress = 'System';
        }

        const stmt = db.prepare(`
            INSERT INTO action_logs (user_id, username, action, target, details, ip_address, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        // Ensure username is a string or null
        const safeUsername = username || 'Unknown';
        const safeUserId = userId === 0 ? null : userId;

        stmt.run(safeUserId, safeUsername, action, target, details || null, ipAddress, new Date().toISOString());
        console.log(`[ACTION LOG] ${safeUsername} (${ipAddress}) performed ${action} on ${target}`);
    } catch (error) {
        console.error('Failed to log action:', error);
    }
}
