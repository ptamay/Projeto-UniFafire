const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'keys.db');
const db = new Database(dbPath);

console.log('Migrating database at:', dbPath);

try {
    // Check if column already exists
    const tableInfo = db.pragma('table_info(users)');
    const activeColumnExists = tableInfo.some(col => col.name === 'active');

    if (!activeColumnExists) {
        console.log("Adding 'active' column to users table...");
        db.exec("ALTER TABLE users ADD COLUMN active BOOLEAN DEFAULT 1");
        console.log("'active' column added successfully.");
    } else {
        console.log("'active' column already exists.");
    }

} catch (error) {
    console.error('Migration failed:', error);
}
