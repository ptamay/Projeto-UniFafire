import { execute } from '@/lib/pg';
import { headers } from 'next/headers';
import { logStructured } from '@/lib/structured-logger';

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
        } catch {
            // Not in a request context (e.g. build time or background job)
            ipAddress = 'System';
        }

        // Ensure username is a string or null
        const safeUsername = username || 'Unknown';
        const safeUserId = userId === 0 ? null : userId;

        await execute(
            `INSERT INTO action_logs (user_id, username, action, target, details, ip_address, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [safeUserId, safeUsername, action, target, details || null, ipAddress, new Date().toISOString()],
        );
        // TASK-033: além da trilha no banco (REQ-010), emite pelo canal estruturado
        // persistente em `app_logs` — fora de `tablesToClear`, sobrevive a
        // limpezas do banco (REQ-014). Destino trocado de arquivo para tabela na
        // TASK-074: no Vercel a escrita em `logs/` falharia em silêncio.
        await logStructured('info', 'audit_action', {
            audit: true,
            user_id: safeUserId,
            username: safeUsername,
            action,
            target,
            details: details || null,
            ip: ipAddress,
        });
    } catch (error) {
        console.error('Failed to log action:', error);
    }
}
