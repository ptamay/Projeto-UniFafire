import Database from 'better-sqlite3';
import path from 'path';

// Prevent multiple instances in dev
const globalWithDb = global as typeof globalThis & {
    db: Database.Database;
};

let db: Database.Database;

if (!globalWithDb.db) {
    const dbPath = path.join(process.cwd(), 'keys.db');
    db = new Database(dbPath);
    globalWithDb.db = db;
} else {
    db = globalWithDb.db;
}

export default db;
