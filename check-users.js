const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'documents.db');
const db = new Database(dbPath);

try {
    const users = db.prepare(`
        SELECT id, username, email, password_hash, salt, firebase_uid, is_active, role 
        FROM users
    `).all();

    console.log('Existing Users:');
    console.log('================');
    if (users.length === 0) {
        console.log('No users found in database.');
    } else {
        users.forEach(user => {
            console.log(`ID: ${user.id}`);
            console.log(`Username: ${user.username}`);
            console.log(`Email: ${user.email}`);
            console.log(`Password Hash: ${user.password_hash ? 'Yes' : 'No'}`);
            console.log(`Salt: ${user.salt ? 'Yes' : 'No'}`);
            console.log(`Firebase UID: ${user.firebase_uid || 'None'}`);
            console.log(`Active: ${user.is_active ? 'Yes' : 'No'}`);
            console.log(`Role: ${user.role}`);
            console.log('---');
        });
    }
} catch (error) {
    console.error('Error:', error.message);
} finally {
    db.close();
}
