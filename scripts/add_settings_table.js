const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../keys.db');
const db = new Database(dbPath);

console.log('Creating settings table...');

db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL
    )
`);

const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
const info = insert.run('auto_logout_time', '18:30');

if (info.changes > 0) {
    console.log('Inserted default auto_logout_time: 18:30');
} else {
    console.log('Table already exists and has default values.');
}
