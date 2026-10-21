const Database = require('better-sqlite3');
const path = require('path');
const app = require('electron').app || { getPath: () => path.join(process.env.APPDATA || process.env.HOME, 'doc-storage-app') };

// Get the database path
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'documents.db');

console.log('Database path:', dbPath);

try {
    const db = new Database(dbPath);
    
    // Check if role column exists
    const tableInfo = db.pragma('table_info(users)');
    const hasRoleColumn = tableInfo.some(col => col.name === 'role');
    
    if (!hasRoleColumn) {
        console.log('Adding role column to users table...');
        db.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "user"');
        console.log('Role column added successfully.');
    }
    
    // List all users
    const users = db.prepare('SELECT id, username, email, role FROM users').all();
    
    if (users.length === 0) {
        console.log('No users found. Please register a user first.');
        process.exit(1);
    }
    
    console.log('\n=== Current Users ===');
    users.forEach(user => {
        console.log(`ID: ${user.id}, Username: ${user.username}, Email: ${user.email}, Role: ${user.role || 'user'}`);
    });
    
    // If there's already an admin
    const existingAdmin = users.find(u => u.role === 'admin');
    if (existingAdmin) {
        console.log(`\nSuper Admin already exists: ${existingAdmin.username} (ID: ${existingAdmin.id})`);
        console.log('You can login with this account to access the Super Admin side.');
        process.exit(0);
    }
    
    // Promote the first user to Super Admin
    const firstUser = users[0];
    console.log(`\n=== Promoting ${firstUser.username} to Super Admin ===`);
    
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', firstUser.id);
    
    console.log(`✓ ${firstUser.username} has been promoted to Super Admin!`);
    console.log(`\nYou can now login with username "${firstUser.username}" to access the Super Admin side.`);
    console.log('The Super Admin button will appear in the sidebar after login.');
    
    db.close();
} catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
}
