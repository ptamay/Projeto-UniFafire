import db from '@/lib/db';

export function logAction(userId: number | null, username: string | undefined | null, action: string, target: string, details?: string) {
    try {
        const stmt = db.prepare(`
            INSERT INTO action_logs (user_id, username, action, target, details)
            VALUES (?, ?, ?, ?, ?)
        `);

        // Ensure username is a string or null
        const safeUsername = username || 'Unknown';

        stmt.run(userId, safeUsername, action, target, details || null);
        console.log(`[ACTION LOG] ${safeUsername} performed ${action} on ${target}`);
    } catch (error) {
        console.error('Failed to log action:', error);
    }
}
