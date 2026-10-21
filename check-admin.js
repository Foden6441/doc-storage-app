const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'documents.db');
const db = new Database(dbPath);

try {
    const users = db.prepare(`
        SELECT id, username, email, role, is_active, created_at 
        FROM users 
        WHERE role = 'admin'
    `).all();

    console.log('Admin Users:');
    console.log('=============');
    if (users.length === 0) {
        console.log('No admin users found in database.');
    } else {
        users.forEach(user => {
            console.log(`ID: ${user.id}`);
            console.log(`Username: ${user.username}`);
            console.log(`Email: ${user.email}`);
            console.log(`Role: ${user.role}`);
            console.log(`Active: ${user.is_active ? 'Yes' : 'No'}`);
            console.log(`Created: ${user.created_at}`);
            console.log('---');
        });
    }

    // Also show all users for reference
    console.log('\nAll Users:');
    console.log('===========');
    const allUsers = db.prepare(`
        SELECT id, username, email, role, is_active 
        FROM users
    `).all();

    allUsers.forEach(user => {
        console.log(`${user.username} (${user.email}) - Role: ${user.role} - Active: ${user.is_active ? 'Yes' : 'No'}`);
    });
} catch (error) {
    console.error('Error:', error.message);
} finally {
    db.close();
}
