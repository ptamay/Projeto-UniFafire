const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'keys.db');
const db = new Database(dbPath);

console.log('Adding ip_address column to action_logs table...');

try {
    const columns = db.prepare("PRAGMA table_info(action_logs)").all().map(c => c.name);

    if (!columns.includes('ip_address')) {
        db.exec("ALTER TABLE action_logs ADD COLUMN ip_address TEXT");
        console.log('✓ Column ip_address added to action_logs');
    } else {
        console.log('✓ Column ip_address already exists');
    }
} catch (error) {
    console.error('Error migrating database:', error);
}

db.close();
console.log('Migration finished.');
