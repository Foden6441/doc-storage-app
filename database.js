const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class FileDatabase {
    constructor(dbPath) {
        this.db = null;
        this.dbPath = dbPath || path.join(__dirname, 'documents.db');
        this.transactionDepth = 0;
    }

    init() {
        try {
            this.db = new Database(this.dbPath);
            this.db.pragma('journal_mode = WAL'); // Enable Write-Ahead Logging for better concurrency
            this.db.pragma('foreign_keys = ON'); // Enable foreign key constraints
            this.createTables();
            this.runMigrations(); // Run database migrations
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Error initializing database:', error);
            throw error;
        }
    }

    // Transaction management
    beginTransaction() {
        if (this.transactionDepth === 0) {
            this.db.exec('BEGIN TRANSACTION');
        }
        this.transactionDepth++;
    }

    commitTransaction() {
        this.transactionDepth--;
        if (this.transactionDepth === 0) {
            this.db.exec('COMMIT');
        }
    }

    rollbackTransaction() {
        this.transactionDepth--;
        if (this.transactionDepth === 0) {
            this.db.exec('ROLLBACK');
        }
    }

    // Execute a function within a transaction
    async withTransaction(callback) {
        this.beginTransaction();
        try {
            const result = await callback();
            this.commitTransaction();
            return result;
        } catch (error) {
            this.rollbackTransaction();
            console.error('Transaction failed, rolled back:', error);
            throw error;
        }
    }

    // Database migration system
    runMigrations() {
        // Create migrations table if it doesn't exist
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL UNIQUE,
                name TEXT NOT NULL,
                applied_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Get current migration version
        const currentVersion = this.db.prepare('SELECT MAX(version) as version FROM migrations').get()?.version || 0;

        // Define migrations
        const migrations = [
            {
                version: 1,
                name: 'initial_schema',
                up: () => {
                    // Initial schema is already created in createTables()
                    console.log('Migration 1: Initial schema applied');
                }
            },
            {
                version: 2,
                name: 'add_indexes',
                up: () => {
                    // Add performance indexes
                    this.db.exec('CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id)');
                    this.db.exec('CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id)');
                    this.db.exec('CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id)');
                    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
                    console.log('Migration 2: Performance indexes added');
                }
            },
            {
                version: 3,
                name: 'add_admin_role',
                up: () => {
                    // Add role column to users table
                    this.db.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "user"');
                    console.log('Migration 3: Admin role column added');
                }
            },
            {
                version: 4,
                name: 'add_subscription_features',
                up: () => {
                    // Add subscription-related columns to users table
                    this.db.exec('ALTER TABLE users ADD COLUMN storage_limit INTEGER DEFAULT 5368709120');
                    this.db.exec('ALTER TABLE users ADD COLUMN storage_used INTEGER DEFAULT 0');
                    this.db.exec('ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT "free"');
                    this.db.exec('ALTER TABLE users ADD COLUMN subscription_expires_at TEXT');
                    console.log('Migration 4: Subscription features added');
                }
            },
            {
                version: 5,
                name: 'add_firebase_uid',
                up: () => {
                    // Add firebase_uid column to users table for Firebase authentication
                    this.db.exec('ALTER TABLE users ADD COLUMN firebase_uid TEXT');
                    console.log('Migration 5: Firebase UID column added');
                }
            },
            {
                version: 6,
                name: 'make_password_nullable',
                up: () => {
                    // Make password_hash and salt nullable for Firebase users
                    // SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table
                    this.db.exec(`
                        CREATE TABLE users_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            username TEXT NOT NULL,
                            email TEXT NOT NULL,
                            password_hash TEXT,
                            salt TEXT,
                            role TEXT DEFAULT 'user',
                            is_active INTEGER DEFAULT 1,
                            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                            last_login TEXT,
                            storage_limit INTEGER DEFAULT 5368709120,
                            storage_used INTEGER DEFAULT 0,
                            subscription_tier TEXT DEFAULT 'free',
                            subscription_expires_at TEXT,
                            firebase_uid TEXT
                        )
                    `);

                    // Copy existing data
                    this.db.exec(`
                        INSERT INTO users_new (id, username, email, password_hash, salt, role, is_active, created_at, last_login, storage_limit, storage_used, subscription_tier, subscription_expires_at, firebase_uid)
                        SELECT id, username, email, password_hash, salt, role, is_active, created_at, last_login, storage_limit, storage_used, subscription_tier, subscription_expires_at, firebase_uid
                        FROM users
                    `);

                    // Drop old table and rename new one
                    this.db.exec('DROP TABLE users');
                    this.db.exec('ALTER TABLE users_new RENAME TO users');

                    // Recreate indexes
                    this.db.exec('CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id)');
                    this.db.exec('CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id)');
                    this.db.exec('CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id)');
                    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');

                    console.log('Migration 6: Password columns made nullable');
                }
            },
            {
                version: 7,
                name: 'add_cloud_file_ids',
                up: () => {
                    this.db.exec('ALTER TABLE files ADD COLUMN cloud_id TEXT');
                    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_files_cloud_id ON files(cloud_id) WHERE cloud_id IS NOT NULL');
                    console.log('Migration 7: Cloud backup IDs added to files');
                }
            }
        ];

        // Run pending migrations
        for (const migration of migrations) {
            if (migration.version > currentVersion) {
                console.log(`Running migration ${migration.version}: ${migration.name}`);
                try {
                    migration.up();
                    this.db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
                } catch (error) {
                    console.error(`Migration ${migration.version} failed:`, error);
                    throw error;
                }
            }
        }
    }

    // Connection management
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('Database connection closed');
        }
    }

    ensureConnection() {
        if (!this.db) {
            this.init();
        }
    }

    createTables() {
        const createUsersTable = `
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                salt TEXT,
                firebase_uid TEXT UNIQUE,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_login TEXT,
                is_active INTEGER DEFAULT 1,
                role TEXT DEFAULT 'user',
                storage_limit INTEGER DEFAULT 5368709120,
                storage_used INTEGER DEFAULT 0,
                subscription_tier TEXT DEFAULT 'free',
                subscription_expires_at TEXT
            )
        `;

        const createSessionsTable = `
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_token TEXT UNIQUE NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `;

        const createFoldersTable = `
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                color TEXT DEFAULT '#3498db',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `;

        const createFilesTable = `
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                folder_id INTEGER,
                name TEXT NOT NULL,
                original_path TEXT NOT NULL,
                stored_path TEXT NOT NULL,
                size INTEGER NOT NULL,
                upload_date TEXT NOT NULL,
                description TEXT,
                tags TEXT,
                file_type TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE
            )
        `;

        const createActivityLogsTable = `
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `;

        const createSystemSettingsTable = `
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                description TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER,
                FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
            )
        `;

        const createTagsTable = `
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createFileTagsTable = `
            CREATE TABLE IF NOT EXISTS file_tags (
                file_id INTEGER,
                tag_id INTEGER,
                FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
                PRIMARY KEY (file_id, tag_id)
            )
        `;

        try {
            this.db.exec(createUsersTable);
            this.db.exec(createSessionsTable);
            this.db.exec(createFoldersTable);
            this.db.exec(createFilesTable);
            this.db.exec(createTagsTable);
            this.db.exec(createFileTagsTable);
            this.db.exec(createActivityLogsTable);
            this.db.exec(createSystemSettingsTable);
        } catch (error) {
            console.error('Error creating tables:', error);
            throw error;
        }
    }

    // Folder operations
    createFolder(userId, folderData) {
        this.ensureConnection();
        
        const insertStmt = this.db.prepare(`
            INSERT INTO folders (user_id, name, description, color)
            VALUES (?, ?, ?, ?)
        `);

        try {
            const result = insertStmt.run(
                userId,
                folderData.name,
                folderData.description || '',
                folderData.color || '#3498db'
            );

            return result.lastInsertRowid;
        } catch (error) {
            console.error('Error creating folder:', error);
            throw error;
        }
    }

    getAllFolders(userId) {
        this.ensureConnection();
        
        const selectStmt = this.db.prepare(`
            SELECT * FROM folders 
            WHERE user_id = ?
            ORDER BY name ASC
        `);

        try {
            const folders = selectStmt.all(userId);
            return folders.map(folder => ({
                id: folder.id,
                name: folder.name,
                description: folder.description,
                color: folder.color,
                createdAt: folder.created_at,
                updatedAt: folder.updated_at
            }));
        } catch (error) {
            console.error('Error getting folders:', error);
            return [];
        }
    }

    getFolderById(folderId, userId) {
        const selectStmt = this.db.prepare(`
            SELECT * FROM folders WHERE id = ? AND user_id = ?
        `);

        try {
            const folder = selectStmt.get(folderId, userId);
            if (folder) {
                return {
                    id: folder.id,
                    name: folder.name,
                    description: folder.description,
                    color: folder.color,
                    createdAt: folder.created_at,
                    updatedAt: folder.updated_at
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting folder by ID:', error);
            return null;
        }
    }

    updateFolder(folderId, userId, updates) {
        this.ensureConnection();
        
        const updateFields = [];
        const values = [];

        Object.keys(updates).forEach(key => {
            if (key !== 'id' && key !== 'user_id') {
                updateFields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        });

        if (updateFields.length === 0) return false;

        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(folderId, userId);

        const updateStmt = this.db.prepare(`
            UPDATE folders 
            SET ${updateFields.join(', ')}
            WHERE id = ? AND user_id = ?
        `);

        try {
            const result = updateStmt.run(...values);
            return result.changes > 0;
        } catch (error) {
            console.error('Error updating folder:', error);
            return false;
        }
    }

    deleteFolder(folderId, userId) {
        this.ensureConnection();
        
        // Use transaction for folder deletion (files should be deleted by cascade)
        this.beginTransaction();
        try {
            const deleteStmt = this.db.prepare(`
                DELETE FROM folders WHERE id = ? AND user_id = ?
            `);

            const result = deleteStmt.run(folderId, userId);
            this.commitTransaction();
            return result.changes > 0;
        } catch (error) {
            this.rollbackTransaction();
            console.error('Error deleting folder:', error);
            return false;
        }
    }

    moveFileToFolder(fileId, folderId, userId) {
        this.ensureConnection();
        
        if (folderId !== null) {
            const folder = this.getFolderById(folderId, userId);
            if (!folder) {
                return false;
            }
        }

        const updateStmt = this.db.prepare(`
            UPDATE files
            SET folder_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `);

        try {
            const result = updateStmt.run(folderId, fileId, userId);
            return result.changes > 0;
        } catch (error) {
            console.error('Error moving file to folder:', error);
            return false;
        }
    }

    saveFile(fileData) {
        this.ensureConnection();
        
        const insertStmt = this.db.prepare(`
            INSERT INTO files (user_id, folder_id, name, original_path, stored_path, size, upload_date, description, tags, file_type, cloud_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        try {
            const fileType = this.getFileType(fileData.name);
            const tags = Array.isArray(fileData.tags) ? fileData.tags.join(',') : fileData.tags || '';
            
            const result = insertStmt.run(
                fileData.userId,
                fileData.folderId || null,
                fileData.name,
                fileData.originalPath,
                fileData.storedPath,
                fileData.size,
                fileData.uploadDate,
                fileData.description || '',
                tags,
                fileType,
                fileData.cloudId || null
            );

            return result.lastInsertRowid;
        } catch (error) {
            console.error('Error saving file to database:', error);
            throw error;
        }
    }

    getAllFiles(userId, folderId = null) {
        this.ensureConnection();
        
        let selectStmt;
        let params;

        if (folderId) {
            selectStmt = this.db.prepare(`
                SELECT f.*, fl.name as folder_name, fl.color as folder_color
                FROM files f
                LEFT JOIN folders fl ON f.folder_id = fl.id
                WHERE f.user_id = ? AND f.folder_id = ?
                ORDER BY f.upload_date DESC
            `);
            params = [userId, folderId];
        } else {
            selectStmt = this.db.prepare(`
                SELECT f.*, fl.name as folder_name, fl.color as folder_color
                FROM files f
                LEFT JOIN folders fl ON f.folder_id = fl.id
                WHERE f.user_id = ?
                ORDER BY f.upload_date DESC
            `);
            params = [userId];
        }

        try {
            const files = selectStmt.all(...params);
            return files.map(file => ({
                id: file.id,
                cloudId: file.cloud_id,
                name: file.name,
                originalPath: file.original_path,
                storedPath: file.stored_path,
                size: file.size,
                uploadDate: file.upload_date,
                description: file.description,
                tags: file.tags ? file.tags.split(',') : [],
                fileType: file.file_type,
                folderId: file.folder_id,
                folderName: file.folder_name,
                folderColor: file.folder_color,
                createdAt: file.created_at,
                updatedAt: file.updated_at
            }));
        } catch (error) {
            console.error('Error getting files:', error);
            return [];
        }
    }

    getFileById(id) {
        this.ensureConnection();
        
        const selectStmt = this.db.prepare(`
            SELECT f.*, fl.name as folder_name, fl.color as folder_color
            FROM files f
            LEFT JOIN folders fl ON f.folder_id = fl.id
            WHERE f.id = ?
        `);

        try {
            const file = selectStmt.get(id);
            if (file) {
                return {
                    id: file.id,
                    user_id: file.user_id,
                    userId: file.user_id,
                    cloudId: file.cloud_id,
                    name: file.name,
                    originalPath: file.original_path,
                    storedPath: file.stored_path,
                    size: file.size,
                    uploadDate: file.upload_date,
                    description: file.description,
                    tags: file.tags ? file.tags.split(',') : [],
                    fileType: file.file_type,
                    folderId: file.folder_id,
                    folderName: file.folder_name,
                    folderColor: file.folder_color,
                    createdAt: file.created_at,
                    updatedAt: file.updated_at
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting file by ID:', error);
            return null;
        }
    }

    updateFile(id, updates) {
        const updateFields = [];
        const values = [];

        Object.keys(updates).forEach(key => {
            if (key !== 'id') {
                updateFields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        });

        if (updateFields.length === 0) return false;

        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const updateStmt = this.db.prepare(`
            UPDATE files 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `);

        try {
            const result = updateStmt.run(...values);
            return result.changes > 0;
        } catch (error) {
            console.error('Error updating file:', error);
            return false;
        }
    }

    deleteFile(id) {
        this.ensureConnection();
        
        const deleteStmt = this.db.prepare(`
            DELETE FROM files WHERE id = ?
        `);

        try {
            const result = deleteStmt.run(id);
            return result.changes > 0;
        } catch (error) {
            console.error('Error deleting file:', error);
            return false;
        }
    }

    findFileByCloudId(userId, cloudId) {
        this.ensureConnection();
        const file = this.db.prepare('SELECT id FROM files WHERE user_id = ? AND cloud_id = ?').get(userId, cloudId);
        return file ? this.getFileById(file.id) : null;
    }

    setFileCloudId(userId, fileId, cloudId) {
        this.ensureConnection();
        const result = this.db.prepare('UPDATE files SET cloud_id = ? WHERE id = ? AND user_id = ? AND (cloud_id IS NULL OR cloud_id = ?)')
            .run(cloudId, fileId, userId, cloudId);
        return result.changes > 0;
    }

    searchFiles(query, userId, options = {}) {
        try {
            const searchTerm = `%${query}%`;
            const results = { files: [], folders: [] };

            // Search files
            const fileSearchStmt = this.db.prepare(`
                SELECT f.*, fl.name as folder_name, fl.color as folder_color
                FROM files f
                LEFT JOIN folders fl ON f.folder_id = fl.id
                WHERE f.user_id = ? AND (f.name LIKE ? OR f.description LIKE ? OR f.tags LIKE ?)
                ORDER BY f.upload_date DESC
                LIMIT ?
            `);

            const limit = options.limit || 50;
            const files = fileSearchStmt.all(userId, searchTerm, searchTerm, searchTerm, limit);

            results.files = files.map(file => ({
                id: file.id,
                name: file.name,
                originalPath: file.original_path,
                storedPath: file.stored_path,
                size: file.size,
                uploadDate: file.upload_date,
                description: file.description,
                tags: file.tags ? file.tags.split(',') : [],
                fileType: file.file_type,
                folderId: file.folder_id,
                folderName: file.folder_name,
                folderColor: file.folder_color,
                createdAt: file.created_at,
                updatedAt: file.updated_at
            }));

            // Search folders
            const folderSearchStmt = this.db.prepare(`
                SELECT * FROM folders
                WHERE user_id = ? AND (name LIKE ? OR description LIKE ?)
                ORDER BY name ASC
                LIMIT ?
            `);

            const folders = folderSearchStmt.all(userId, searchTerm, searchTerm, limit);

            results.folders = folders.map(folder => ({
                id: folder.id,
                name: folder.name,
                description: folder.description,
                color: folder.color,
                createdAt: folder.created_at,
                updatedAt: folder.updated_at
            }));

            return results;
        } catch (error) {
            console.error('Error searching files and folders:', error);
            return { files: [], folders: [] };
        }
    }

    advancedSearch(searchParams, userId) {
        try {
            const results = { files: [], folders: [] };

            // Build dynamic search query for files
            let fileQuery = `
                SELECT f.*, fl.name as folder_name, fl.color as folder_color
                FROM files f
                LEFT JOIN folders fl ON f.folder_id = fl.id
                WHERE f.user_id = ?
            `;

            const fileParams = [userId];

            if (searchParams.fileName) {
                fileQuery += ` AND f.name LIKE ?`;
                fileParams.push(`%${searchParams.fileName}%`);
            }

            if (searchParams.fileType) {
                fileQuery += ` AND f.file_type = ?`;
                fileParams.push(searchParams.fileType);
            }

            if (searchParams.folderId) {
                fileQuery += ` AND f.folder_id = ?`;
                fileParams.push(searchParams.folderId);
            }

            if (searchParams.tags) {
                fileQuery += ` AND f.tags LIKE ?`;
                fileParams.push(`%${searchParams.tags}%`);
            }

            if (searchParams.description) {
                fileQuery += ` AND f.description LIKE ?`;
                fileParams.push(`%${searchParams.description}%`);
            }

            if (searchParams.dateFrom) {
                fileQuery += ` AND f.upload_date >= ?`;
                fileParams.push(searchParams.dateFrom);
            }

            if (searchParams.dateTo) {
                fileQuery += ` AND f.upload_date <= ?`;
                fileParams.push(searchParams.dateTo);
            }

            if (searchParams.sizeMin) {
                fileQuery += ` AND f.size >= ?`;
                fileParams.push(searchParams.sizeMin);
            }

            if (searchParams.sizeMax) {
                fileQuery += ` AND f.size <= ?`;
                fileParams.push(searchParams.sizeMax);
            }

            fileQuery += ` ORDER BY f.upload_date DESC LIMIT ?`;
            fileParams.push(searchParams.limit || 100);

            const fileSearchStmt = this.db.prepare(fileQuery);
            const files = fileSearchStmt.all(...fileParams);

            results.files = files.map(file => ({
                id: file.id,
                name: file.name,
                originalPath: file.original_path,
                storedPath: file.stored_path,
                size: file.size,
                uploadDate: file.upload_date,
                description: file.description,
                tags: file.tags ? file.tags.split(',') : [],
                fileType: file.file_type,
                folderId: file.folder_id,
                folderName: file.folder_name,
                folderColor: file.folder_color,
                createdAt: file.created_at,
                updatedAt: file.updated_at
            }));

            // Build dynamic search query for folders
            let folderQuery = `SELECT * FROM folders WHERE user_id = ?`;
            const folderParams = [userId];

            if (searchParams.folderName) {
                folderQuery += ` AND name LIKE ?`;
                folderParams.push(`%${searchParams.folderName}%`);
            }

            if (searchParams.folderDescription) {
                folderQuery += ` AND description LIKE ?`;
                folderParams.push(`%${searchParams.folderDescription}%`);
            }

            folderQuery += ` ORDER BY name ASC LIMIT ?`;
            folderParams.push(searchParams.limit || 50);

            const folderSearchStmt = this.db.prepare(folderQuery);
            const folders = folderSearchStmt.all(...folderParams);

            results.folders = folders.map(folder => ({
                id: folder.id,
                name: folder.name,
                description: folder.description,
                color: folder.color,
                createdAt: folder.created_at,
                updatedAt: folder.updated_at
            }));

            return results;
        } catch (error) {
            console.error('Error performing advanced search:', error);
            return { files: [], folders: [] };
        }
    }

    getFilesByType(fileType) {
        const selectStmt = this.db.prepare(`
            SELECT f.*, fl.name as folder_name, fl.color as folder_color
            FROM files f
            LEFT JOIN folders fl ON f.folder_id = fl.id
            WHERE f.file_type = ?
            ORDER BY f.upload_date DESC
        `);

        try {
            const files = selectStmt.all(fileType);
            return files.map(file => ({
                id: file.id,
                name: file.name,
                originalPath: file.original_path,
                storedPath: file.stored_path,
                size: file.size,
                uploadDate: file.upload_date,
                description: file.description,
                tags: file.tags ? file.tags.split(',') : [],
                fileType: file.file_type,
                folderId: file.folder_id,
                folderName: file.folder_name,
                folderColor: file.folder_color,
                createdAt: file.created_at,
                updatedAt: file.updated_at
            }));
        } catch (error) {
            console.error('Error getting files by type:', error);
            return [];
        }
    }

    getFileStats() {
        const statsStmt = this.db.prepare(`
            SELECT 
                COUNT(*) as total_files,
                SUM(size) as total_size,
                COUNT(DISTINCT file_type) as unique_types
            FROM files
        `);

        try {
            const stats = statsStmt.get();
            return {
                totalFiles: stats.total_files || 0,
                totalSize: stats.total_size || 0,
                uniqueTypes: stats.unique_types || 0
            };
        } catch (error) {
            console.error('Error getting file stats:', error);
            return {
                totalFiles: 0,
                totalSize: 0,
                uniqueTypes: 0
            };
        }
    }

    getFileType(fileName) {
        const extension = fileName.split('.').pop().toLowerCase();
        
        const typeMap = {
            'pdf': 'document',
            'doc': 'document',
            'docx': 'document',
            'txt': 'document',
            'rtf': 'document',
            'jpg': 'image',
            'jpeg': 'image',
            'png': 'image',
            'gif': 'image',
            'bmp': 'image',
            'mp4': 'video',
            'avi': 'video',
            'mov': 'video',
            'mp3': 'audio',
            'wav': 'audio',
            'zip': 'archive',
            'rar': 'archive',
            '7z': 'archive'
        };
        
        return typeMap[extension] || 'other';
    }

    // Activity logging
    logActivity(userId, action, details = null, ipAddress = null, userAgent = null) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO activity_logs (user_id, action, details, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run(userId, action, details, ipAddress, userAgent);
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    }

    getActivityLogs(limit = 100, offset = 0) {
        try {
            const stmt = this.db.prepare(`
                SELECT 
                    al.id,
                    al.user_id,
                    al.action,
                    al.details,
                    al.ip_address,
                    al.user_agent,
                    al.created_at,
                    u.username,
                    u.email
                FROM activity_logs al
                JOIN users u ON al.user_id = u.id
                ORDER BY al.created_at DESC
                LIMIT ? OFFSET ?
            `);
            return stmt.all(limit, offset);
        } catch (error) {
            console.error('Error getting activity logs:', error);
            return [];
        }
    }

    getActivityLogsByUser(userId, limit = 50) {
        try {
            const stmt = this.db.prepare(`
                SELECT 
                    al.id,
                    al.user_id,
                    al.action,
                    al.details,
                    al.ip_address,
                    al.user_agent,
                    al.created_at
                FROM activity_logs al
                WHERE al.user_id = ?
                ORDER BY al.created_at DESC
                LIMIT ?
            `);
            return stmt.all(userId, limit);
        } catch (error) {
            console.error('Error getting activity logs by user:', error);
            return [];
        }
    }

    // System settings
    getSystemSetting(key) {
        try {
            const stmt = this.db.prepare('SELECT value, description, updated_at, updated_by FROM system_settings WHERE key = ?');
            const result = stmt.get(key);
            if (result) {
                return {
                    key,
                    value: result.value,
                    description: result.description,
                    updatedAt: result.updated_at,
                    updatedBy: result.updated_by
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting system setting:', error);
            return null;
        }
    }

    setSystemSetting(key, value, description = null, updatedBy = null) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO system_settings (key, value, description, updated_by)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    description = excluded.description,
                    updated_by = excluded.updated_by,
                    updated_at = CURRENT_TIMESTAMP
            `);
            stmt.run(key, value, description, updatedBy);
            return true;
        } catch (error) {
            console.error('Error setting system setting:', error);
            return false;
        }
    }

    getAllSystemSettings() {
        try {
            const stmt = this.db.prepare('SELECT key, value, description, updated_at, updated_by FROM system_settings ORDER BY key');
            return stmt.all();
        } catch (error) {
            console.error('Error getting all system settings:', error);
            return [];
        }
    }

    deleteSystemSetting(key) {
        try {
            const stmt = this.db.prepare('DELETE FROM system_settings WHERE key = ?');
            stmt.run(key);
            return true;
        } catch (error) {
            console.error('Error deleting system setting:', error);
            return false;
        }
    }

    // Advanced statistics
    getAdvancedStats() {
        try {
            const stats = {};

            // Storage usage by user
            const storageByUser = this.db.prepare(`
                SELECT u.id, u.username, u.email, SUM(f.size) as total_size, COUNT(f.id) as file_count
                FROM users u
                LEFT JOIN files f ON u.id = f.user_id
                GROUP BY u.id
                ORDER BY total_size DESC
            `);
            stats.storageByUser = storageByUser.all();

            // File type distribution
            const fileTypeDist = this.db.prepare(`
                SELECT file_type, COUNT(*) as count, SUM(size) as total_size
                FROM files
                GROUP BY file_type
                ORDER BY count DESC
            `);
            stats.fileTypeDistribution = fileTypeDist.all();

            // Recent activity (last 7 days)
            const recentActivity = this.db.prepare(`
                SELECT action, COUNT(*) as count
                FROM activity_logs
                WHERE created_at >= datetime('now', '-7 days')
                GROUP BY action
                ORDER BY count DESC
            `);
            stats.recentActivity = recentActivity.all();

            // User registration trends (last 30 days)
            const userTrends = this.db.prepare(`
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as count
                FROM users
                WHERE created_at >= datetime('now', '-30 days')
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `);
            stats.userRegistrationTrends = userTrends.all();

            // Total storage used
            const totalStorage = this.db.prepare('SELECT SUM(size) as total FROM files');
            stats.totalStorage = (totalStorage.get()?.total || 0);

            // Average file size
            const avgFileSize = this.db.prepare('SELECT AVG(size) as avg FROM files');
            stats.averageFileSize = (avgFileSize.get()?.avg || 0);

            return stats;
        } catch (error) {
            console.error('Error getting advanced stats:', error);
            return null;
        }
    }

    // Subscription and storage management
    getUserStorageInfo(userId) {
        try {
            const stmt = this.db.prepare(`
                SELECT storage_limit, storage_used, subscription_tier, subscription_expires_at
                FROM users
                WHERE id = ?
            `);
            const result = stmt.get(userId);
            if (result) {
                return {
                    storageLimit: result.storage_limit || 5368709120, // 5GB default
                    storageUsed: result.storage_used || 0,
                    subscriptionTier: result.subscription_tier || 'free',
                    subscriptionExpiresAt: result.subscription_expires_at,
                    storageAvailable: (result.storage_limit || 5368709120) - (result.storage_used || 0),
                    storagePercentage: Math.round(((result.storage_used || 0) / (result.storage_limit || 5368709120)) * 100)
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting user storage info:', error);
            return null;
        }
    }

    updateUserStorageUsed(userId) {
        try {
            const stmt = this.db.prepare(`
                SELECT SUM(size) as total_size
                FROM files
                WHERE user_id = ?
            `);
            const result = stmt.get(userId);
            const totalSize = result.total_size || 0;

            const updateStmt = this.db.prepare(`
                UPDATE users
                SET storage_used = ?
                WHERE id = ?
            `);
            updateStmt.run(totalSize, userId);

            return totalSize;
        } catch (error) {
            console.error('Error updating user storage used:', error);
            return 0;
        }
    }

    checkStorageLimit(userId, fileSize) {
        try {
            const storageInfo = this.getUserStorageInfo(userId);
            if (!storageInfo) {
                return false;
            }

            return (storageInfo.storageUsed + fileSize) <= storageInfo.storageLimit;
        } catch (error) {
            console.error('Error checking storage limit:', error);
            return false;
        }
    }

    updateUserSubscription(userId, tier, storageLimit, expiresAt = null) {
        try {
            const stmt = this.db.prepare(`
                UPDATE users
                SET subscription_tier = ?, storage_limit = ?, subscription_expires_at = ?
                WHERE id = ?
            `);
            stmt.run(tier, storageLimit, expiresAt, userId);
            return true;
        } catch (error) {
            console.error('Error updating user subscription:', error);
            return false;
        }
    }

    getSubscriptionPlans() {
        return [
            {
                id: 'free',
                name: 'Free',
                storage: 5368709120, // 5GB
                price: 0,
                features: ['5GB Storage', 'Basic Features']
            },
            {
                id: 'basic',
                name: 'Basic',
                storage: 53687091200, // 50GB
                price: 9.99,
                features: ['50GB Storage', 'Priority Support', 'Advanced Search']
            },
            {
                id: 'premium',
                name: 'Premium',
                storage: 536870912000, // 500GB
                price: 29.99,
                features: ['500GB Storage', 'Priority Support', 'Advanced Search', 'Cloud Sync', 'API Access']
            }
        ];
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

module.exports = FileDatabase; 
