const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'keys.db');
const db = new Database(dbPath);

console.log('Migrating database to add active column...');

try {
    // Add to employees
    try {
        db.exec(`ALTER TABLE employees ADD COLUMN active INTEGER DEFAULT 1;`);
        console.log('Added active column to employees.');
    } catch (e) {
        if (e.message.includes('duplicate column name')) {
            console.log('Column active already exists in employees.');
        } else {
            throw e;
        }
    }

    // Add to users
    try {
        db.exec(`ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1;`);
        console.log('Added active column to users.');
    } catch (e) {
        if (e.message.includes('duplicate column name')) {
            console.log('Column active already exists in users.');
        } else {
            throw e;
        }
    }

    console.log('Migration completed successfully.');
} catch (error) {
    console.error('Migration failed:', error);
}
