const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const firebaseService = require('./firebase.js');

class AuthService {
    constructor(dbPath, fileDatabase = null) {
        this.db = null;
        this.dbPath = dbPath;
        this.currentUser = null;
        this.fileDatabase = fileDatabase;
        this.useFirebase = true; // Use Firebase for authentication
    }

    init() {
        try {
            this.db = new Database(this.dbPath);
            // Tables are created by the main FileDatabase class
            console.log('Auth service initialized successfully');
        } catch (error) {
            console.error('Error initializing auth service:', error);
            throw error;
        }
    }

    setFileDatabase(fileDatabase) {
        this.fileDatabase = fileDatabase;
    }

    setFirebaseEnabled(enabled) {
        this.useFirebase = enabled;
    }



    // Hash password with salt
    hashPassword(password, salt) {
        return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    }

    // Generate random salt
    generateSalt() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Generate session token
    generateSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    // User registration
    async registerUser(username, email, password) {
        try {
            if (this.useFirebase) {
                // Try Firebase registration first
                try {
                    const firebaseResult = await firebaseService.registerUser(email, password, username);
                    if (firebaseResult.success) {
                        const firebaseUser = firebaseResult.user;
                        const firebaseUid = firebaseUser.uid;

                        // Check if user already exists in local database
                        const existingUser = this.db.prepare(`
                            SELECT id, role FROM users WHERE firebase_uid = ? OR email = ?
                        `).get(firebaseUid, email);

                        if (existingUser) {
                            // Update existing user, preserving role
                            this.db.prepare(`
                                UPDATE users SET username = ?, email = ?, firebase_uid = ? WHERE id = ?
                            `).run(username, email, firebaseUid, existingUser.id);

                            // Log activity
                            if (this.fileDatabase) {
                                this.fileDatabase.logActivity(existingUser.id, 'USER_REGISTERED', `User re-registered with Firebase: ${username}`);
                            }

                            return {
                                success: true,
                                userId: existingUser.id,
                                firebaseUid: firebaseUid,
                                message: 'User registered successfully'
                            };
                        }

                        // Create new user in local database
                        try {
                            const insertStmt = this.db.prepare(`
                                INSERT INTO users (username, email, firebase_uid, role, is_active)
                                VALUES (?, ?, ?, 'user', 1)
                            `);

                            const result = insertStmt.run(username, email, firebaseUid);

                            // Log activity
                            if (this.fileDatabase) {
                                this.fileDatabase.logActivity(result.lastInsertRowid, 'USER_REGISTERED', `New user registered with Firebase: ${username}`);
                            }

                            return {
                                success: true,
                                userId: result.lastInsertRowid,
                                firebaseUid: firebaseUid,
                                message: 'User registered successfully'
                            };
                        } catch (dbError) {
                            console.error('Error inserting user into local database:', dbError.message);
                            console.error('Database error details:', dbError);
                            // Check if it's a duplicate email error
                            if (dbError.message.includes('UNIQUE') || dbError.message.includes('constraint')) {
                                // User might already exist locally with this email
                                const localUser = this.db.prepare(`
                                    SELECT id, firebase_uid FROM users WHERE email = ?
                                `).get(email);

                                if (localUser && !localUser.firebase_uid) {
                                    // Update existing local user with Firebase UID
                                    this.db.prepare(`
                                        UPDATE users SET firebase_uid = ?, username = ? WHERE id = ?
                                    `).run(firebaseUid, username, localUser.id);

                                    if (this.fileDatabase) {
                                        this.fileDatabase.logActivity(localUser.id, 'USER_REGISTERED', `User linked to Firebase: ${username}`);
                                    }

                                    return {
                                        success: true,
                                        userId: localUser.id,
                                        firebaseUid: firebaseUid,
                                        message: 'User registered successfully'
                                    };
                                }
                            }
                            return { success: false, error: 'Failed to create local user record' };
                        }
                    }
                } catch (firebaseError) {
                    // Firebase registration failed, fall back to SQLite
                    console.log('Firebase registration failed, trying SQLite fallback:', firebaseError.message);
                }
            }

            // Local SQLite registration (fallback)
            const existingUser = this.db.prepare(`
                SELECT id FROM users WHERE username = ? OR email = ?
            `).get(username, email);

            if (existingUser) {
                return { success: false, error: 'Username or email already exists' };
            }

            const salt = this.generateSalt();
            const passwordHash = this.hashPassword(password, salt);

            const insertStmt = this.db.prepare(`
                INSERT INTO users (username, email, password_hash, salt, role, is_active)
                VALUES (?, ?, ?, ?, 'user', 1)
            `);

            const result = insertStmt.run(username, email, passwordHash, salt);

            if (this.fileDatabase) {
                this.fileDatabase.logActivity(result.lastInsertRowid, 'USER_REGISTERED', `New user registered: ${username}`);
            }

            return {
                success: true,
                userId: result.lastInsertRowid,
                message: 'User registered successfully'
            };
        } catch (error) {
            console.error('Error registering user:', error);
            return { success: false, error: 'Registration failed' };
        }
    }

    // User login
    async loginUser(username, password) {
        try {
            if (this.useFirebase) {
                // Check if input is email or username
                let email = username;
                const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);

                if (!isEmail) {
                    // Input is username, look up email in local database
                    const userByEmail = this.db.prepare(`
                        SELECT email FROM users WHERE username = ?
                    `).get(username);

                    if (userByEmail && userByEmail.email) {
                        email = userByEmail.email;
                    } else {
                        // Username not found, try Firebase login with username (will fail)
                        // Then fall back to SQLite
                    }
                }

                // Try Firebase login first
                try {
                    const firebaseResult = await firebaseService.loginUser(email, password);
                    if (firebaseResult.success) {
                        const firebaseUser = firebaseResult.user;
                        const firebaseUid = firebaseUser.uid;

                        // Find user in local database by Firebase UID
                        let user = this.db.prepare(`
                            SELECT id, username, email, is_active, role
                            FROM users WHERE firebase_uid = ?
                        `).get(firebaseUid);

                        if (!user) {
                            // User authenticated in Firebase but not in local database
                            // Check if user exists by email (existing SQLite user)
                            const existingUser = this.db.prepare(`
                                SELECT id, username, email, is_active, role
                                FROM users WHERE email = ?
                            `).get(firebaseUser.email);

                            if (existingUser) {
                                // Update existing user with Firebase UID, preserving role
                                this.db.prepare(`
                                    UPDATE users SET firebase_uid = ?, username = ? WHERE id = ?
                                `).run(firebaseUid, firebaseUser.displayName || existingUser.username, existingUser.id);

                                user = existingUser;
                            } else {
                                // Create new local user record
                                const insertStmt = this.db.prepare(`
                                    INSERT INTO users (username, email, firebase_uid, role, is_active)
                                    VALUES (?, ?, ?, 'user', 1)
                                `);
                                const result = insertStmt.run(firebaseUser.displayName || username, firebaseUser.email, firebaseUid);

                                user = this.db.prepare(`
                                    SELECT id, username, email, is_active, role
                                    FROM users WHERE id = ?
                                `).get(result.lastInsertRowid);
                            }
                        }

                        if (!user.is_active) {
                            return { success: false, error: 'Account is deactivated' };
                        }

                        // Generate session token
                        const sessionToken = this.generateSessionToken();
                        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

                        // Create session
                        const sessionStmt = this.db.prepare(`
                            INSERT INTO sessions (user_id, session_token, expires_at)
                            VALUES (?, ?, ?)
                        `);
                        sessionStmt.run(user.id, sessionToken, expiresAt);

                        // Update last login
                        this.db.prepare(`
                            UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
                        `).run(user.id);

                        // Set current user
                        this.currentUser = {
                            id: user.id,
                            username: user.username,
                            email: user.email,
                            role: user.role || 'user',
                            firebaseUid: firebaseUid,
                            sessionToken: sessionToken
                        };

                        // Log activity
                        if (this.fileDatabase) {
                            this.fileDatabase.logActivity(user.id, 'USER_LOGIN', `User logged in with Firebase: ${user.username}`);
                        }

                        return {
                            success: true,
                            user: this.currentUser,
                            message: 'Login successful'
                        };
                    }
                } catch (firebaseError) {
                    // Firebase login failed, fall back to SQLite silently
                    console.log('Firebase login failed, trying SQLite fallback:', firebaseError.message);
                    // Don't throw the error, just continue to SQLite fallback
                }
            }

            // Local SQLite login (fallback for existing users)
            const user = this.db.prepare(`
                SELECT id, username, email, password_hash, salt, is_active, role
                FROM users WHERE username = ? OR email = ?
            `).get(username, username);

            if (!user) {
                return { success: false, error: 'Invalid credentials' };
            }

            if (!user.is_active) {
                return { success: false, error: 'Account is deactivated' };
            }

            // Check if user has password hash (SQLite user)
            if (!user.password_hash || !user.salt) {
                return { success: false, error: 'Please register with Firebase to create an account' };
            }

            const passwordHash = this.hashPassword(password, user.salt);
            if (passwordHash !== user.password_hash) {
                return { success: false, error: 'Invalid credentials' };
            }

            const sessionToken = this.generateSessionToken();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            const sessionStmt = this.db.prepare(`
                INSERT INTO sessions (user_id, session_token, expires_at)
                VALUES (?, ?, ?)
            `);
            sessionStmt.run(user.id, sessionToken, expiresAt);

            this.db.prepare(`
                UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
            `).run(user.id);

            this.currentUser = {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role || 'user',
                sessionToken: sessionToken
            };

            if (this.fileDatabase) {
                this.fileDatabase.logActivity(user.id, 'USER_LOGIN', `User logged in with SQLite: ${user.username}`);
            }

            return {
                success: true,
                user: this.currentUser,
                message: 'Login successful'
            };
        } catch (error) {
            console.error('Error logging in user:', error);
            return { success: false, error: 'Login failed' };
        }
    }

    // Verify session token
    async verifySession(sessionToken) {
        try {
            const session = this.db.prepare(`
                SELECT s.session_token, s.expires_at, u.id, u.username, u.email, u.role
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.session_token = ? AND s.expires_at > datetime('now')
            `).get(sessionToken);

            if (!session) {
                return { success: false, error: 'Invalid or expired session' };
            }

            this.currentUser = {
                id: session.id,
                username: session.username,
                email: session.email,
                role: session.role || 'user',
                sessionToken: session.session_token
            };

            return { success: true, user: this.currentUser };
        } catch (error) {
            console.error('Error verifying session:', error);
            return { success: false, error: 'Session verification failed' };
        }
    }

    // Logout user
    async logoutUser(sessionToken) {
        try {
            const userId = this.currentUser?.id;
            const username = this.currentUser?.username;

            this.db.prepare(`
                DELETE FROM sessions WHERE session_token = ?
            `).run(sessionToken);

            // Log activity
            if (this.fileDatabase && userId) {
                this.fileDatabase.logActivity(userId, 'USER_LOGOUT', `User logged out: ${username}`);
            }

            this.currentUser = null;
            return { success: true, message: 'Logout successful' };
        } catch (error) {
            console.error('Error logging out user:', error);
            return { success: false, error: 'Logout failed' };
        }
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Get user profile
    getUserProfile() {
        if (!this.currentUser) {
            return { success: false, error: 'No user logged in' };
        }

        try {
            const user = this.db.prepare(`
                SELECT id, username, email, created_at, is_active
                FROM users WHERE id = ?
            `).get(this.currentUser.id);

            if (!user) {
                return { success: false, error: 'User not found' };
            }

            return { 
                success: true, 
                profile: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdAt: user.created_at,
                    isActive: user.is_active
                }
            };
        } catch (error) {
            console.error('Error getting user profile:', error);
            return { success: false, error: 'Failed to get profile' };
        }
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.currentUser !== null;
    }

    // Change password
    async changePassword(userId, currentPassword, newPassword) {
        try {
            const user = this.db.prepare(`
                SELECT password_hash, salt FROM users WHERE id = ?
            `).get(userId);

            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Verify current password
            const currentPasswordHash = this.hashPassword(currentPassword, user.salt);
            if (currentPasswordHash !== user.password_hash) {
                return { success: false, error: 'Current password is incorrect' };
            }

            // Generate new salt and hash for new password
            const newSalt = this.generateSalt();
            const newPasswordHash = this.hashPassword(newPassword, newSalt);

            // Update password
            this.db.prepare(`
                UPDATE users SET password_hash = ?, salt = ? WHERE id = ?
            `).run(newPasswordHash, newSalt, userId);

            return { success: true, message: 'Password changed successfully' };
        } catch (error) {
            console.error('Error changing password:', error);
            return { success: false, error: 'Password change failed' };
        }
    }

    // Delete user account
    async deleteUser(userId, password) {
        try {
            const user = this.db.prepare(`
                SELECT password_hash, salt FROM users WHERE id = ?
            `).get(userId);

            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Verify password
            const passwordHash = this.hashPassword(password, user.salt);
            if (passwordHash !== user.password_hash) {
                return { success: false, error: 'Password is incorrect' };
            }

            // Delete user (this will cascade to sessions and user files)
            this.db.prepare(`
                DELETE FROM users WHERE id = ?
            `).run(userId);

            this.currentUser = null;
            return { success: true, message: 'Account deleted successfully' };
        } catch (error) {
            console.error('Error deleting user:', error);
            return { success: false, error: 'Account deletion failed' };
        }
    }

    // Clean up expired sessions
    cleanupExpiredSessions() {
        try {
            this.db.prepare(`
                DELETE FROM sessions WHERE expires_at < datetime('now')
            `).run();
        } catch (error) {
            console.error('Error cleaning up expired sessions:', error);
        }
    }

    // Admin: Set user role
    setUserRole(userId, role) {
        try {
            if (!['user', 'admin'].includes(role)) {
                return { success: false, error: 'Invalid role' };
            }

            this.db.prepare(`
                UPDATE users SET role = ? WHERE id = ?
            `).run(role, userId);

            return { success: true };
        } catch (error) {
            console.error('Error setting user role:', error);
            return { success: false, error: 'Failed to set user role' };
        }
    }

    // Admin: Get all users
    getAllUsers() {
        try {
            const users = this.db.prepare(`
                SELECT id, username, email, role, created_at, last_login, is_active
                FROM users
                ORDER BY created_at DESC
            `).all();

            return { success: true, users };
        } catch (error) {
            console.error('Error getting all users:', error);
            return { success: false, error: 'Failed to get users' };
        }
    }

    // Admin: Deactivate user
    deactivateUser(userId) {
        try {
            this.db.prepare(`
                UPDATE users SET is_active = 0 WHERE id = ?
            `).run(userId);

            return { success: true };
        } catch (error) {
            console.error('Error deactivating user:', error);
            return { success: false, error: 'Failed to deactivate user' };
        }
    }

    // Admin: Activate user
    activateUser(userId) {
        try {
            this.db.prepare(`
                UPDATE users SET is_active = 1 WHERE id = ?
            `).run(userId);

            return { success: true };
        } catch (error) {
            console.error('Error activating user:', error);
            return { success: false, error: 'Failed to activate user' };
        }
    }

    // Admin: Delete user
    adminDeleteUser(userId) {
        try {
            // This will cascade to sessions and files due to foreign keys
            this.db.prepare(`
                DELETE FROM users WHERE id = ?
            `).run(userId);

            return { success: true };
        } catch (error) {
            console.error('Error deleting user:', error);
            return { success: false, error: 'Failed to delete user' };
        }
    }

    // Check if current user is admin
    isAdmin() {
        return this.currentUser && this.currentUser.role === 'admin';
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

module.exports = AuthService; 