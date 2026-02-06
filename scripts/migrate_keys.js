const Database = require('better-sqlite3');
const db = new Database('keys.db');

try {
    const info = db.prepare("PRAGMA table_info(keys)").all();
    const hasCol = info.find(c => c.name === 'employee_id');

    if (!hasCol) {
        db.prepare("ALTER TABLE keys ADD COLUMN employee_id INTEGER REFERENCES employees(id)").run();
        console.log("Added employee_id column to keys table.");
    } else {
        console.log("Column employee_id already exists.");
    }
} catch (e) {
    console.error("Migration failed:", e);
}
