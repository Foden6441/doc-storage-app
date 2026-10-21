const FileDatabase = require('./database.js');
const path = require('path');

const dbPath = path.join(__dirname, 'documents.db');
const db = new FileDatabase(dbPath);

try {
    db.init();
    
    const allUsers = db.db.prepare('SELECT id, username, email, role, is_active, created_at FROM users').all();
    
    console.log('=== ALL USERS IN DATABASE ===');
    console.log(`Total users: ${allUsers.length}`);
    console.log('');
    
    if (allUsers.length === 0) {
        console.log('No users found in database.');
    } else {
        allUsers.forEach(user => {
            console.log(`ID: ${user.id}`);
            console.log(`Username: ${user.username}`);
            console.log(`Email: ${user.email}`);
            console.log(`Role: ${user.role}`);
            console.log(`Active: ${user.is_active ? 'Yes' : 'No'}`);
            console.log(`Created: ${user.created_at}`);
            console.log('---');
        });
    }
    
    console.log('=============================');
} catch (error) {
    console.error('Error:', error.message);
} finally {
    db.close();
}
