# Admin Panel Setup Guide

This guide explains how to set up and use the Admin Panel in the Document Storage App. The Admin Panel allows administrators to manage users, view system statistics, and control access to the application.

## What is the Admin Panel?

The Admin Panel provides administrators with:
- **User Management**: View all users, promote/demote admins, activate/deactivate accounts, delete users
- **System Statistics**: View total users, active users, admins, and total files
- **Access Control**: Control who can access the application and their permissions

## Prerequisites

- The Document Storage App must be installed
- You need access to the application's database
- Basic understanding of database operations

## Step-by-Step Setup

### Step 1: Create the First Admin User

Since there are no admin users initially, you need to manually promote a user to admin using the database.

#### Option A: Using SQLite Command Line

1. Locate your application's database file:
   - **Windows**: `%APPDATA%/doc-storage-app/documents.db`
   - **macOS**: `~/Library/Application Support/doc-storage-app/documents.db`
   - **Linux**: `~/.config/doc-storage-app/documents.db`

2. Open the database with SQLite:
   ```bash
   sqlite3 documents.db
   ```

3. List existing users:
   ```sql
   SELECT id, username, email, role FROM users;
   ```

4. Promote a user to admin (replace `1` with the user's ID):
   ```sql
   UPDATE users SET role = 'admin' WHERE id = 1;
   ```

5. Verify the change:
   ```sql
   SELECT id, username, email, role FROM users WHERE role = 'admin';
   ```

6. Exit SQLite:
   ```bash
   .quit
   ```

#### Option B: Using a SQLite GUI Tool

1. Download a SQLite GUI tool like [DB Browser for SQLite](https://sqlitebrowser.org/)
2. Open the `documents.db` file
3. Navigate to the `users` table
4. Find the user you want to make admin
5. Change their `role` column from `user` to `admin`
6. Save the changes

### Step 2: Login as Admin

1. Launch the Document Storage App
2. Login with the account you just promoted to admin
3. You will see a new **"Admin"** tab in the More Options section

### Step 3: Access the Admin Panel

1. Click **"More Options"** in the sidebar
2. Click the **"Admin"** tab (shield icon)
3. The Admin Panel will load with system statistics and user list

## Using the Admin Panel

### Dashboard Statistics

The admin panel displays four key statistics:
- **Total Users**: Number of registered users
- **Active Users**: Users with active accounts
- **Admins**: Number of admin users
- **Total Files**: Total files stored by all users

### User Management

The user table shows all registered users with:
- **ID**: Unique user identifier
- **Username**: User's username
- **Email**: User's email address
- **Role**: User's role (admin or user)
- **Status**: Account status (active or inactive)
- **Created**: Account creation date
- **Actions**: Available management actions

#### Available Actions

**Make Admin**
- Promotes a regular user to admin
- Only available for non-admin users
- Gives the user full admin privileges

**Deactivate**
- Disables a user's account
- User cannot login while deactivated
- User's data is preserved
- Can be reactivated later

**Activate**
- Re-enables a deactivated user's account
- User can login again
- All previous data is intact

**Delete**
- Permanently deletes the user account
- **Warning**: This action cannot be undone
- Deletes all user files and data
- Use with extreme caution

## Security Best Practices

### Admin Account Management

1. **Limit Admin Access**: Only give admin privileges to trusted users
2. **Use Strong Passwords**: Admin accounts should have strong, unique passwords
3. **Regular Audits**: Periodically review admin accounts and remove unnecessary ones
4. **Monitor Activity**: Keep track of admin actions in the application

### User Management

1. **Verify Before Deleting**: Always verify user identity before deletion
2. **Deactivate First**: Consider deactivating accounts before deletion
3. **Backup Important Data**: Backup user data before deletion if needed
4. **Document Actions**: Keep records of significant admin actions

### Database Security

1. **Protect Database File**: Ensure the database file is not accessible to unauthorized users
2. **Regular Backups**: Backup the database regularly
3. **File Permissions**: Set appropriate file permissions on the database
4. **Encryption**: Consider encrypting the database for sensitive deployments

## Troubleshooting

### Admin Tab Not Showing

**Problem**: The Admin tab doesn't appear in More Options

**Solutions**:
1. Verify the user's role in the database:
   ```sql
   SELECT role FROM users WHERE username = 'your_username';
   ```
2. Ensure the role is exactly `'admin'` (case-sensitive)
3. Logout and login again to refresh the session
4. Check the browser console for JavaScript errors

### Access Denied Errors

**Problem**: "Access denied. Admin only." error when using admin features

**Solutions**:
1. Verify you're logged in with the correct admin account
2. Check that your session hasn't expired
3. Re-login to refresh your session
4. Verify the role in the database

### Database Connection Issues

**Problem**: Cannot connect to the database to set up admin

**Solutions**:
1. Ensure the application is not running (database may be locked)
2. Check file permissions on the database file
3. Verify the database file path is correct
4. Try copying the database to a temporary location

### User Actions Not Working

**Problem**: Admin actions (activate, deactivate, delete) fail

**Solutions**:
1. Check the browser console for error messages
2. Verify you have admin privileges
3. Ensure the user ID is correct
4. Check that the user isn't yourself (some actions are restricted)

## Advanced Configuration

### Multiple Admins

You can have multiple admin users:
1. Promote additional users using the same method
2. Each admin has full access to all admin features
3. Admins cannot change their own role or delete themselves

### Custom Admin Permissions

Currently, all admins have full access. To implement custom permissions:
1. Modify the `auth.js` file to add permission checks
2. Update the IPC handlers in `main.js` to check specific permissions
3. Modify the admin panel UI to show/hide features based on permissions

### Audit Logging

To track admin actions:
1. Create an audit log table in the database
2. Log all admin actions with timestamps
3. Add a view in the admin panel to display the audit log

## Database Schema Reference

### Users Table

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login TEXT,
    is_active INTEGER DEFAULT 1,
    role TEXT DEFAULT 'user'
);
```

### Role Values

- `'user'`: Regular user with standard access
- `'admin'`: Administrator with full management access

### Status Values

- `1` (active): User can login and use the app
- `0` (inactive): User cannot login

## API Reference

### Admin IPC Handlers

The following IPC handlers are available for admin operations:

- `admin-get-users`: Retrieve all users
- `admin-set-user-role`: Change a user's role
- `admin-deactivate-user`: Deactivate a user account
- `admin-activate-user`: Activate a user account
- `admin-delete-user`: Delete a user account
- `admin-get-stats`: Get system statistics

All admin handlers require the current user to have the `'admin'` role.

## Support

If you encounter issues:
1. Check this guide's troubleshooting section
2. Review the application logs in the console
3. Verify database integrity
4. Ensure all prerequisites are met

## Best Practices Summary

- **Always backup** before making significant changes
- **Test admin actions** on non-critical accounts first
- **Limit admin access** to necessary personnel only
- **Document all admin actions** for accountability
- **Regular security audits** of admin accounts
- **Keep software updated** for security patches

---

**Last Updated**: September 2026
**Version**: 1.0
