const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'keys.db');
const db = new Database(dbPath);

console.log('Patching keys.db...');
try {
  db.prepare('ALTER TABLE history ADD COLUMN user_id INTEGER REFERENCES users(id)').run();
  console.log('Added user_id to history table.');
} catch (e) {
  console.log('user_id column might already exist:', e.message);
}

try {
  db.prepare('ALTER TABLE history ADD COLUMN username TEXT').run();
  console.log('Added username to history table.');
} catch (e) {
  console.log('username column might already exist:', e.message);
}

console.log('Patch complete.');
db.close();
