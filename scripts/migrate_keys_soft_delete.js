const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../keys.db');
const db = new Database(dbPath);

console.log('Migrating keys table to add soft delete (active column)...');

try {
    const info = db.prepare("PRAGMA table_info(keys)").all();
    const hasCol = info.find(c => c.name === 'active');

    if (!hasCol) {
        db.prepare("ALTER TABLE keys ADD COLUMN active INTEGER DEFAULT 1").run();
        console.log("Added active column to keys table.");
        // Ensure all existing keys are marked as active
        db.prepare("UPDATE keys SET active = 1").run();
    } else {
        console.log("Column 'active' already exists in keys.");
    }
} catch (e) {
    console.error("Migration failed:", e);
}
