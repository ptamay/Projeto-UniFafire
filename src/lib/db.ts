import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { startCronJobs } from './backup';

const globalWithDb = global as typeof globalThis & {
    db: Database.Database;
};

const dbPath = path.resolve(process.cwd(), 'keys.db');

export function initDb() {
    const instance = new Database(dbPath);
    instance.pragma('foreign_keys = ON');
    globalWithDb.db = instance;
    console.log('Database connected.');
    
    // Evitar iniciar jobs de cron durante o build
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
        startCronJobs();
    }
}

if (!globalWithDb.db) {
    initDb();
}

/**
 * Closes current connection, allows file replacement via callback, and reconnects.
 */
export function resetConnection(onClosed?: () => void) {
    if (globalWithDb.db) {
        try {
            globalWithDb.db.close();
            console.log('Database connection closed for reset.');
        } catch (e) {
            console.error('Error closing DB:', e);
        }
    }
    
    // Execute file swap or any logic while DB is definitively detached
    if (onClosed) onClosed();

    initDb();
}

// Create a proxy so that all imports of 'db' dynamically point to the current global instance.
const dbProxy = new Proxy({}, {
    get: (target, prop) => {
        if (!globalWithDb.db) initDb();

        const value = (globalWithDb.db as any)[prop];
        if (typeof value === 'function') {
            return value.bind(globalWithDb.db);
        }
        return value;
    }
});

export default dbProxy as Database.Database;
