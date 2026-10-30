const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('./database.js');
const AuthService = require('./auth.js');
const { initAppPaths, getDbPath, getUploadsDir } = require('./app-paths.js');
const firebaseService = require('./firebase.js');

// Handle different Electron loading scenarios
let app, BrowserWindow, ipcMain, dialog;
try {
  // Try the standard way first
  const electron = require('electron');
  if (typeof electron === 'string') {
    // Electron executable path returned, need to load differently
    app = require('electron').app;
    BrowserWindow = require('electron').BrowserWindow;
    ipcMain = require('electron').ipcMain;
    dialog = require('electron').dialog;
  } else {
    // Standard electron module
    ({ app, BrowserWindow, ipcMain, dialog } = electron);
  }
} catch (e) {
  console.error('Failed to load electron:', e);
  process.exit(1);
}

let mainWindow;
let db;
let authService;
let firebaseConfig = null;

// Default Firebase configuration (pre-configured for all users)
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyClj_zg9RD_Zol9u09EYZDbWXf2M9a2RF4",
  authDomain: "doc-storage-app-b2cb1.firebaseapp.com",
  projectId: "doc-storage-app-b2cb1",
  storageBucket: "doc-storage-app-b2cb1.firebasestorage.app",
  messagingSenderId: "872120318112",
  appId: "1:872120318112:web:450bca9ff11ae19cb6f1c5",
  measurementId: "G-0R8SKFL945"
};

// Server-side validation functions
const validators = {
  fileName: (name) => {
    if (!name || typeof name !== 'string') return false;
    if (name.length > 255) return false;
    if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
    if (name.includes('\0')) return false;
    return true;
  },

  folderName: (name) => {
    if (!name || typeof name !== 'string') return false;
    if (name.trim().length === 0 || name.trim().length > 100) return false;
    if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
    if (name.includes('\0')) return false;
    return true;
  },

  email: (email) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 255;
  },

  username: (username) => {
    if (!username || typeof username !== 'string') return false;
    if (username.length < 3 || username.length > 30) return false;
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    return usernameRegex.test(username);
  },

  password: (password) => {
    if (!password || typeof password !== 'string') return false;
    if (password.length < 6 || password.length > 128) return false;
    return true;
  },

  searchQuery: (query) => {
    if (!query || typeof query !== 'string') return false;
    if (query.trim().length === 0 || query.length > 500) return false;
    return true;
  },

  folderId: (id) => {
    if (id === null || id === undefined) return true;
    if (typeof id !== 'number' || id <= 0) return false;
    return true;
  },

  fileId: (id) => {
    if (typeof id !== 'number' || id <= 0) return false;
    return true;
  },

  color: (color) => {
    if (!color || typeof color !== 'string') return false;
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    return colorRegex.test(color);
  },

  filePath: (filePath) => {
    if (!filePath || typeof filePath !== 'string') return false;
    if (filePath.includes('\0')) return false;
    if (filePath.includes('..')) return false;
    return true;
  }
};

const sanitize = {
  string: (input) => {
    if (typeof input !== 'string') return input;
    return input.trim();
  },

  description: (desc) => {
    if (typeof desc !== 'string') return desc;
    return desc.trim().substring(0, 500);
  }
};

// Helper function to format bytes to human-readable format
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function getCloudUser(localUser) {
  const cloudUser = firebaseService.getCurrentUser();
  if (!localUser?.firebaseUid || !cloudUser || cloudUser.uid !== localUser.firebaseUid) {
    throw new Error('Sign in with your cloud account to use backup and restore.');
  }
  return cloudUser;
}

async function backUpLocalFile(localUser, file) {
  getCloudUser(localUser);
  if (!file.cloudId) {
    const cloudId = crypto.randomUUID();
    if (!db.setFileCloudId(localUser.id, file.id, cloudId)) {
      throw new Error(`Could not prepare a cloud backup for ${file.name}`);
    }
    file.cloudId = cloudId;
  }

  return firebaseService.syncFile(file, file.storedPath);
}

async function restoreCloudBackup(localUser) {
  try {
    getCloudUser(localUser);
    const result = await firebaseService.getUserFiles();
    if (!result.success) return result;

    const uploadsDir = getUploadsDir();
    fs.mkdirSync(uploadsDir, { recursive: true });
    let restoredFiles = 0;
    let failedFiles = 0;

    for (const cloudFile of result.files) {
      if (!cloudFile.cloudId || !validators.fileName(cloudFile.name)) {
        failedFiles++;
        continue;
      }
      if (db.findFileByCloudId(localUser.id, cloudFile.cloudId)) continue;

      const localPath = path.join(uploadsDir, `${localUser.id}_${crypto.randomUUID()}_${cloudFile.name}`);
      const download = await firebaseService.downloadFile(cloudFile.cloudId, localPath);
      if (!download.success) {
        failedFiles++;
        continue;
      }

      db.saveFile({
        userId: localUser.id,
        cloudId: cloudFile.cloudId,
        folderId: null,
        name: cloudFile.name,
        originalPath: '',
        storedPath: localPath,
        size: Number(cloudFile.size) || fs.statSync(localPath).size,
        uploadDate: cloudFile.uploadDate || new Date().toISOString(),
        description: cloudFile.description || '',
        tags: cloudFile.tags || ''
      });
      restoredFiles++;
    }

    if (restoredFiles) db.updateUserStorageUsed(localUser.id);
    return {
      success: failedFiles === 0,
      restoredFiles,
      failedFiles,
      error: failedFiles ? `Could not restore ${failedFiles} cloud file(s). Try Restore from Cloud again.` : undefined
    };
  } catch (error) {
    console.error('Cloud restore failed:', error);
    return { success: false, restoredFiles: 0, failedFiles: 0, error: error.message };
  }
}

async function backUpAllLocalFiles(localUser) {
  getCloudUser(localUser);
  const files = db.getAllFiles(localUser.id);
  let backedUpFiles = 0;
  const failures = [];

  for (const file of files) {
    if (!file.storedPath || !fs.existsSync(file.storedPath)) {
      failures.push(file.name);
      continue;
    }
    try {
      const backupResult = await backUpLocalFile(localUser, file);
      if (!backupResult.success) throw new Error(backupResult.error || 'Cloud upload failed');
      backedUpFiles++;
    } catch (error) {
      failures.push(file.name);
      console.error(`Cloud backup failed for ${file.name}:`, error);
    }
  }

  return { success: failures.length === 0, backedUpFiles, failedFiles: failures };
}

// Helper function to import folder recursively
async function importFolderRecursively(folderPath, dbFolderId, userId) {
  const importedFiles = [];

  try {
    const items = fs.readdirSync(folderPath);
    const uploadDir = getUploadsDir();

    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    for (const item of items) {
      const itemPath = path.join(folderPath, item);
      const stats = fs.statSync(itemPath);

      if (stats.isFile()) {
        // Process file
        const fileName = path.basename(itemPath);
        const fileExtension = path.extname(fileName).toLowerCase();

        // Filter supported file types
        const supportedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.jpg', '.jpeg', '.png', '.gif', '.bmp'];
        if (supportedExtensions.includes(fileExtension)) {
          // Generate unique filename to avoid conflicts
          const timestamp = Date.now();
          const uniqueFileName = `${timestamp}_${fileName}`;
          const destinationPath = path.join(uploadDir, uniqueFileName);

          // Copy file to uploads directory
          fs.copyFileSync(itemPath, destinationPath);

          // Save file metadata to database
          const fileData = {
            userId: userId,
            folderId: dbFolderId,
            name: fileName,
            originalPath: itemPath,
            storedPath: destinationPath,
            size: stats.size,
            uploadDate: new Date().toISOString(),
            description: `Imported from folder: ${folderPath}`,
            tags: 'imported,folder'
          };

          const fileId = db.saveFile(fileData);
          // Cloud backup disabled - documents stored locally only
          /*
          const activeUser = authService.getCurrentUser();
          if (activeUser?.id === userId && activeUser.firebaseUid && firebaseService.isSyncEnabled()) {
            try {
              await backUpLocalFile(activeUser, db.getFileById(fileId));
            } catch (backupError) {
              console.error(`Cloud backup failed for imported file ${fileName}:`, backupError);
            }
          }
          */
          importedFiles.push({
            id: fileId,
            name: fileName,
            size: stats.size,
            path: itemPath
          });
        }
      } else if (stats.isDirectory()) {
        // For subdirectories, we could create sub-folders, but for simplicity,
        // we'll import all files into the main folder
        const subFolderFiles = await importFolderRecursively(itemPath, dbFolderId, userId);
        importedFiles.push(...subFolderFiles);
      }
    }
  } catch (error) {
    console.error('Error reading folder:', folderPath, error);
  }

  return importedFiles;
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets/icon.png');
  const windowOptions = {
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Document Storage App',
    show: false
  };

  if (fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'login.html'));

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load window:', errorCode, errorDescription);
    dialog.showErrorBox(
      'Document Storage App',
      `Failed to load the application window.\n\n${errorDescription}`
    );
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

function showStartupError(error) {
  const message = error && error.stack ? error.stack : String(error);
  console.error('Startup failed:', message);

  try {
    const logPath = path.join(app.getPath('userData'), 'startup-error.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, `${new Date().toISOString()}\n${message}\n`);
  } catch (logError) {
    console.error('Could not write startup log:', logError);
  }

  dialog.showErrorBox(
    'Document Storage App',
    `The app could not start.\n\n${error.message || message}\n\nCheck startup-error.log in your app data folder.`
  );
}

async function startApp() {
  initAppPaths();
  const dbPath = getDbPath();

  db = new Database(dbPath);
  db.init();

  authService = new AuthService(dbPath, db);
  authService.init();
  authService.cleanupExpiredSessions();

  // Initialize Firebase with default config or saved config
  try {
    const configPath = path.join(app.getPath('userData'), 'firebase-config.json');
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      firebaseService.initialize(firebaseConfig);
      console.log('Firebase initialized from config file');
    } else {
      // Use default Firebase configuration
      firebaseConfig = DEFAULT_FIREBASE_CONFIG;
      firebaseService.initialize(firebaseConfig);
      console.log('Firebase initialized with default configuration');
    }

    // Disable cloud sync - documents stored locally only
    firebaseService.setSyncEnabled(false);
    authService.setFirebaseEnabled(true);
    console.log('Firebase authentication enabled, cloud sync disabled (local storage only)');
  } catch (error) {
    console.log('Firebase failed to initialize:', error.message);
  }

  createWindow();
}

app.whenReady().then(startApp).catch(showStartupError);

process.on('uncaughtException', (error) => {
  if (app.isReady()) {
    showStartupError(error);
  } else {
    console.error('Uncaught exception before app ready:', error);
  }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    // Close database connections before quitting
    if (db) db.close();
    if (authService) authService.close();
    app.quit();
  }
});

app.on('before-quit', function () {
  // Ensure database connections are closed before app quits
  if (db) db.close();
  if (authService) authService.close();
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for file operations
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

// Select folder from device
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('save-file', async (event, filePath, metadata) => {
  try {
    // Server-side validation
    if (!validators.filePath(filePath)) {
      return { success: false, error: 'Invalid file path' };
    }

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }

    const fileName = path.basename(filePath);
    if (!validators.fileName(fileName)) {
      return { success: false, error: 'Invalid file name' };
    }

    if (metadata && metadata.folderId !== undefined && !validators.folderId(metadata.folderId)) {
      return { success: false, error: 'Invalid folder ID' };
    }

    // Save metadata to database
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'User not authenticated' };
    }

    const fileSize = fs.statSync(filePath).size;

    // Check storage limit
    const hasStorage = db.checkStorageLimit(currentUser.id, fileSize);
    if (!hasStorage) {
      const storageInfo = db.getUserStorageInfo(currentUser.id);
      return {
        success: false,
        error: `Storage limit exceeded. You have used ${storageInfo.storagePercentage}% of your ${formatBytes(storageInfo.storageLimit)} limit. Please upgrade your subscription.`
      };
    }

    const uploadDir = getUploadsDir();
    fs.mkdirSync(uploadDir, { recursive: true });
    const destinationPath = path.join(uploadDir, `${currentUser.id}_${Date.now()}_${fileName}`);
    fs.copyFileSync(filePath, destinationPath);

    const fileData = {
      userId: currentUser.id,
      folderId: metadata?.folderId || null,
      name: fileName,
      originalPath: filePath,
      storedPath: destinationPath,
      size: fileSize,
      uploadDate: new Date().toISOString(),
      description: metadata?.description ? sanitize.description(metadata.description) : '',
      tags: metadata?.tags ? sanitize.string(metadata.tags) : ''
    };

    const id = db.saveFile(fileData);
    fileData.id = id;

    // Update user storage used
    db.updateUserStorageUsed(currentUser.id);

    // Log activity
    db.logActivity(currentUser.id, 'FILE_UPLOADED', `File uploaded: ${fileName}`);

    // Cloud backup disabled - documents stored locally only
    /*
    let cloudBackup = { success: false, skipped: true };
    if (currentUser.firebaseUid && firebaseService.isSyncEnabled()) {
      try {
        cloudBackup = await backUpLocalFile(currentUser, { ...fileData, id, cloudId: fileData.cloudId });
      } catch (cloudError) {
        cloudBackup = { success: false, error: cloudError.message };
      }
    }
    */

    return { success: true, id, fileData, cloudBackup: { success: false, skipped: true, message: 'Cloud backup disabled - local storage only' } };
  } catch (error) {
    console.error('Error saving file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-files', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return [];
    }
    return db.getAllFiles(currentUser.id);
  } catch (error) {
    console.error('Error getting files:', error);
    return [];
  }
});

function deleteStoredFile(fileId) {
  const file = db.getFileById(fileId);
  if (!file) {
    return false;
  }

  if (file.storedPath && fs.existsSync(file.storedPath)) {
    fs.unlinkSync(file.storedPath);
  }

  db.deleteFile(fileId);

  // Update user storage used
  if (file.user_id) {
    db.updateUserStorageUsed(file.user_id);
  }

  return true;
}

ipcMain.handle('delete-file', async (event, fileId) => {
  try {
    // Server-side validation
    if (!validators.fileId(fileId)) {
      return { success: false, error: 'Invalid file ID' };
    }

    const currentUser = authService.getCurrentUser();
    const file = db.getFileById(fileId);

    if (!currentUser) {
      return { success: false, error: 'User not authenticated' };
    }
    if (!file || file.user_id !== currentUser.id) {
      return { success: false, error: 'File not found' };
    }

    const deleted = deleteStoredFile(fileId);
    if (deleted) {
      // Log activity
      if (currentUser && file) {
        db.logActivity(currentUser.id, 'FILE_DELETED', `File deleted: ${file.name}`);
      }
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    console.error('Error deleting file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-files', async (event, fileIds) => {
  try {
    // Server-side validation
    if (!Array.isArray(fileIds)) {
      return { success: false, error: 'File IDs must be an array', deleted: 0, failed: 0 };
    }

    const ids = fileIds;
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'User not authenticated', deleted: 0, failed: ids.length };
    }
    let deleted = 0;
    let failed = 0;

    for (const fileId of ids) {
      try {
        if (!validators.fileId(fileId)) {
          failed++;
          continue;
        }
        const file = db.getFileById(fileId);
        if (!file || file.user_id !== currentUser.id) {
          failed++;
          continue;
        }
        if (deleteStoredFile(fileId)) {
          deleted++;
        } else {
          failed++;
        }
      } catch (fileError) {
        console.error('Error deleting file:', fileId, fileError);
        failed++;
      }
    }

    return {
      success: deleted > 0,
      deleted,
      failed
    };
  } catch (error) {
    console.error('Error deleting files:', error);
    return { success: false, error: error.message, deleted: 0, failed: fileIds?.length || 0 };
  }
});

ipcMain.handle('open-file', async (event, fileId) => {
  try {
    // Server-side validation
    if (!validators.fileId(fileId)) {
      return { success: false, error: 'Invalid file ID' };
    }

    const currentUser = authService.getCurrentUser();
    const file = db.getFileById(fileId);
    if (!currentUser || !file || file.user_id !== currentUser.id) {
      return { success: false, error: 'File not found' };
    }
    if (file && fs.existsSync(file.storedPath)) {
      const { shell } = require('electron');
      shell.openPath(file.storedPath);
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    console.error('Error opening file:', error);
    return { success: false, error: error.message };
  }
});

// Authentication IPC handlers
ipcMain.handle('register-user', async (event, username, email, password) => {
  try {
    if (!firebaseService.isReady()) {
      return { success: false, error: 'Cloud accounts are unavailable until Firebase is configured. No local-only account was created.' };
    }
    // Server-side validation
    if (!validators.username(username)) {
      return { success: false, error: 'Invalid username' };
    }
    if (!validators.email(email)) {
      return { success: false, error: 'Invalid email' };
    }
    if (!validators.password(password)) {
      return { success: false, error: 'Invalid password' };
    }

    const result = await authService.registerUser(sanitize.string(username), sanitize.string(email), password);
    return result;
  } catch (error) {
    console.error('Error registering user:', error);
    // Don't show Firebase errors to user if fallback is available
    if (error.code && error.code.startsWith('auth/')) {
      return { success: false, error: 'Registration failed. Please try again.' };
    }
    return { success: false, error: 'Registration failed' };
  }
});

ipcMain.handle('login-user', async (event, username, password) => {
  try {
    // Server-side validation
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return { success: false, error: 'Invalid username' };
    }
    if (!validators.password(password)) {
      return { success: false, error: 'Invalid password' };
    }

    const result = await authService.loginUser(sanitize.string(username), password);
    // Cloud restore disabled - documents stored locally only
    /*
    if (result.success && result.user?.firebaseUid && firebaseService.isSyncEnabled()) {
      result.backupRestore = await restoreCloudBackup(result.user);
      if (result.backupRestore.success && result.backupRestore.restoredFiles > 0) {
        result.message = `Signed in. Restored ${result.backupRestore.restoredFiles} files from your cloud backup.`;
      } else if (!result.backupRestore.success) {
        result.message = `Signed in, but cloud restore failed: ${result.backupRestore.error}`;
      }
    } else if (result.success && !result.user?.firebaseUid) {
      result.message = 'Signed in on this computer. This local account is not connected to cloud backup.';
    }
    */
    if (result.success) {
      result.message = 'Signed in successfully. Documents are stored locally on your device.';
    }
    return result;
  } catch (error) {
    console.error('Error logging in user:', error);
    // Don't show Firebase errors to user if fallback is available
    if (error.code && error.code.startsWith('auth/')) {
      return { success: false, error: 'Login failed. Please try again.' };
    }
    return { success: false, error: 'Login failed' };
  }
});

ipcMain.handle('send-password-reset', async (event, email) => {
  try {
    if (typeof email !== 'string' || !validators.email(email.trim())) {
      return { success: false, error: 'Enter a valid email address first.' };
    }
    return await firebaseService.sendPasswordReset(email.trim());
  } catch (error) {
    console.error('Error requesting password reset:', error);
    return { success: false, error: 'Could not send the reset email. Please try again.' };
  }
});

ipcMain.handle('logout-user', async (event) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      const result = await authService.logoutUser(currentUser.sessionToken);
      if (firebaseService.getCurrentUser()) await firebaseService.logoutUser();
      return result;
    }
    return { success: true, message: 'Already logged out' };
  } catch (error) {
    console.error('Error logging out user:', error);
    return { success: false, error: 'Logout failed' };
  }
});

ipcMain.handle('check-auth', async (event) => {
  try {
    return authService.isAuthenticated();
  } catch (error) {
    console.error('Error checking auth:', error);
    return false;
  }
});

ipcMain.handle('get-current-user', async (event) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (currentUser?.firebaseUid && firebaseService.isSyncEnabled()) {
      await restoreCloudBackup(currentUser);
    }
    return currentUser;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
});

ipcMain.handle('change-password', async (event, currentPassword, newPassword) => {
  try {
    // Server-side validation
    if (!validators.password(currentPassword)) {
      return { success: false, error: 'Invalid current password' };
    }
    if (!validators.password(newPassword)) {
      return { success: false, error: 'Invalid new password' };
    }

    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    if (currentUser.firebaseUid) {
      try {
        getCloudUser(currentUser);
      } catch (error) {
        return { success: false, error: error.message };
      }
      const changed = await firebaseService.changePassword(currentPassword, newPassword);
      if (!changed.success) return changed;
      authService.updatePasswordHash(currentUser.id, newPassword);
      return { success: true, message: 'Cloud account password changed successfully' };
    }
    return await authService.changePassword(currentUser.id, currentPassword, newPassword);
  } catch (error) {
    console.error('Error changing password:', error);
    return { success: false, error: 'Password change failed' };
  }
});

ipcMain.handle('restore-session', async (event, sessionToken) => {
  try {
    // Server-side validation
    if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.length !== 64) {
      return { success: false, error: 'Invalid session token' };
    }
    authService.cleanupExpiredSessions();
    return await authService.verifySession(sessionToken);
  } catch (error) {
    console.error('Error restoring session:', error);
    return { success: false, error: 'Session restore failed' };
  }
});

ipcMain.handle('get-user-profile', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const profile = authService.getUserProfile(currentUser.id);
    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    return { success: true, profile };
  } catch (error) {
    console.error('Error getting user profile:', error);
    return { success: false, error: 'Failed to load profile' };
  }
});

ipcMain.handle('get-session-info', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    return {
      success: true,
      session: {
        userId: currentUser.id,
        username: currentUser.username,
        email: currentUser.email,
        role: currentUser.role,
        sessionToken: currentUser.sessionToken,
        isActive: true,
        createdAt: currentUser.created_at || new Date().toISOString(),
        expiresAt: null
      }
    };
  } catch (error) {
    console.error('Error getting session info:', error);
    return { success: false, error: 'Failed to load session info' };
  }
});

ipcMain.handle('logout-other-sessions', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const success = authService.logoutAllSessionsExcept(
      currentUser.id,
      currentUser.sessionToken
    );
    return { success };
  } catch (error) {
    console.error('Error logging out other sessions:', error);
    return { success: false, error: 'Failed to end other sessions' };
  }
});

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

ipcMain.handle('export-backup', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose backup destination folder'
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'Cancelled' };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(result.filePaths[0], `DocStore-Backup-${timestamp}`);
    fs.mkdirSync(backupDir, { recursive: true });

    const dbPath = getDbPath();
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(backupDir, 'documents.db'));
    }

    const uploadsPath = getUploadsDir();
    if (fs.existsSync(uploadsPath)) {
      copyRecursive(uploadsPath, path.join(backupDir, 'uploads'));
    }

    fs.writeFileSync(
      path.join(backupDir, 'backup-info.json'),
      JSON.stringify({
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        app: 'doc-storage-app'
      }, null, 2)
    );

    return { success: true, path: backupDir };
  } catch (error) {
    console.error('Error exporting backup:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-backup', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select backup folder (must contain documents.db)'
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'Cancelled' };
    }

    const backupDir = result.filePaths[0];
    const backupDb = path.join(backupDir, 'documents.db');

    if (!fs.existsSync(backupDb)) {
      return { success: false, error: 'No documents.db found in the selected folder' };
    }

    db.close();
    authService.close();

    fs.copyFileSync(backupDb, getDbPath());

    const backupUploads = path.join(backupDir, 'uploads');
    const uploadsPath = getUploadsDir();

    if (fs.existsSync(backupUploads)) {
      if (fs.existsSync(uploadsPath)) {
        fs.rmSync(uploadsPath, { recursive: true, force: true });
      }
      copyRecursive(backupUploads, uploadsPath);
    }

    db.init();
    authService.init();
    authService.cleanupExpiredSessions();

    return { success: true, needsRestart: true };
  } catch (error) {
    console.error('Error importing backup:', error);
    try {
      db.init();
      authService.init();
    } catch (reinitError) {
      console.error('Error reinitializing after failed import:', reinitError);
    }
    return { success: false, error: error.message };
  }
});

// Folder management IPC handlers
ipcMain.handle('create-folder', async (event, folderData) => {
  try {
    // Server-side validation
    if (!folderData || typeof folderData !== 'object') {
      return { success: false, error: 'Invalid folder data' };
    }

    if (!validators.folderName(folderData.name)) {
      return { success: false, error: 'Invalid folder name' };
    }

    if (folderData.color && !validators.color(folderData.color)) {
      return { success: false, error: 'Invalid color format' };
    }

    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const sanitizedFolderData = {
      name: sanitize.string(folderData.name),
      description: folderData.description ? sanitize.description(folderData.description) : '',
      color: folderData.color || '#3498db'
    };

    const folderId = db.createFolder(currentUser.id, sanitizedFolderData);
    return { success: true, folderId };
  } catch (error) {
    console.error('Error creating folder:', error);
    return { success: false, error: 'Failed to create folder' };
  }
});

ipcMain.handle('get-folders', async (event) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return [];
    }
    return db.getAllFolders(currentUser.id);
  } catch (error) {
    console.error('Error getting folders:', error);
    return [];
  }
});

ipcMain.handle('update-folder', async (event, folderId, updates) => {
  try {
    // Server-side validation
    if (!validators.fileId(folderId)) {
      return { success: false, error: 'Invalid folder ID' };
    }

    if (!updates || typeof updates !== 'object') {
      return { success: false, error: 'Invalid updates data' };
    }

    if (updates.name && !validators.folderName(updates.name)) {
      return { success: false, error: 'Invalid folder name' };
    }

    if (updates.color && !validators.color(updates.color)) {
      return { success: false, error: 'Invalid color format' };
    }

    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const sanitizedUpdates = {};
    if (updates.name !== undefined) sanitizedUpdates.name = sanitize.string(updates.name);
    if (updates.description !== undefined) sanitizedUpdates.description = sanitize.description(updates.description);
    if (updates.color !== undefined) sanitizedUpdates.color = updates.color;

    const success = db.updateFolder(folderId, currentUser.id, sanitizedUpdates);
    return { success };
  } catch (error) {
    console.error('Error updating folder:', error);
    return { success: false, error: 'Failed to update folder' };
  }
});

ipcMain.handle('delete-folder', async (event, folderId) => {
  try {
    // Server-side validation
    if (!validators.fileId(folderId)) {
      return { success: false, error: 'Invalid folder ID' };
    }

    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const filesInFolder = db.getAllFiles(currentUser.id, folderId);
    for (const file of filesInFolder) {
      if (file.storedPath && fs.existsSync(file.storedPath)) {
        try {
          fs.unlinkSync(file.storedPath);
        } catch (unlinkError) {
          console.error('Error deleting file on disk:', file.storedPath, unlinkError);
        }
      }
      db.deleteFile(file.id);
    }

    const success = db.deleteFolder(folderId, currentUser.id);
    return { success, deletedFiles: filesInFolder.length };
  } catch (error) {
    console.error('Error deleting folder:', error);
    return { success: false, error: 'Failed to delete folder' };
  }
});

ipcMain.handle('move-file-to-folder', async (event, fileId, folderId) => {
  try {
    // Server-side validation
    if (!validators.fileId(fileId)) {
      return { success: false, error: 'Invalid file ID' };
    }
    if (!validators.folderId(folderId)) {
      return { success: false, error: 'Invalid folder ID' };
    }

    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const success = db.moveFileToFolder(fileId, folderId, currentUser.id);
    if (!success) {
      return { success: false, error: 'File or folder not found' };
    }
    return { success: true };
  } catch (error) {
    console.error('Error moving file to folder:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-files-in-folder', async (event, folderId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return [];
    }
    return db.getAllFiles(currentUser.id, folderId);
  } catch (error) {
    console.error('Error getting files in folder:', error);
    return [];
  }
});

// Add file to specific folder
ipcMain.handle('add-file-to-folder', async (event, folderId) => {
  try {
    // Server-side validation
    if (!validators.folderId(folderId)) {
      return { success: false, error: 'Invalid folder ID' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      
      // Validate file path
      if (!validators.filePath(filePath)) {
        return { success: false, error: 'Invalid file path' };
      }

      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File does not exist' };
      }

      const fileName = path.basename(filePath);
      if (!validators.fileName(fileName)) {
        return { success: false, error: 'Invalid file name' };
      }

      const uploadDir = getUploadsDir();

      // Create uploads directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const destinationPath = path.join(uploadDir, fileName);

      // Copy file to uploads directory
      fs.copyFileSync(filePath, destinationPath);

      // Save metadata to database
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        return { success: false, error: 'User not authenticated' };
      }

      const fileData = {
        userId: currentUser.id,
        folderId: folderId,
        name: fileName,
        originalPath: filePath,
        storedPath: destinationPath,
        size: fs.statSync(filePath).size,
        uploadDate: new Date().toISOString(),
        description: '',
        tags: ''
      };

      const id = db.saveFile(fileData);
      return { success: true, id, fileData };
    }

    return { success: false, error: 'No file selected' };
  } catch (error) {
    console.error('Error adding file to folder:', error);
    return { success: false, error: error.message };
  }
});

// Import folder from device
ipcMain.handle('import-folder-from-device', async (event, targetFolderId = null) => {
  try {
    // Server-side validation
    if (targetFolderId !== undefined && !validators.folderId(targetFolderId)) {
      return { success: false, error: 'Invalid folder ID' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'No folder selected' };
    }

    const selectedFolderPath = result.filePaths[0];
    
    // Validate the selected folder path
    if (!validators.filePath(selectedFolderPath)) {
      return { success: false, error: 'Invalid folder path' };
    }

    if (!fs.existsSync(selectedFolderPath)) {
      return { success: false, error: 'Selected folder does not exist' };
    }

    const folderName = path.basename(selectedFolderPath);
    if (!validators.folderName(folderName)) {
      return { success: false, error: 'Invalid folder name' };
    }

    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'User not authenticated' };
    }

    // Create a new folder in the database for the imported folder
    let dbFolderId = targetFolderId;
    if (!targetFolderId) {
      dbFolderId = db.createFolder(currentUser.id, {
        name: sanitize.string(folderName),
        description: `Imported from: ${selectedFolderPath}`.substring(0, 500),
        color: '#9b59b6'
      });
    }

    // Get all files in the selected folder recursively
    const importedFiles = await importFolderRecursively(selectedFolderPath, dbFolderId, currentUser.id);

    return { success: true, importedCount: importedFiles.length, folderId: dbFolderId };
  } catch (error) {
    console.error('Error importing folder:', error);
    return { success: false, error: error.message };
  }
});

// Search operations
ipcMain.handle('search-files', async (event, query, options = {}) => {
  try {
    // Server-side validation
    if (!validators.searchQuery(query)) {
      return { success: false, error: 'Invalid search query' };
    }

    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const results = db.searchFiles(currentUser.id, sanitize.string(query), options);
    return { success: true, results };
  } catch (error) {
    console.error('Error searching files:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('advanced-search', async (event, searchParams) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    // Validate search parameters
    if (!searchParams || typeof searchParams !== 'object') {
      return { success: false, error: 'Invalid search parameters' };
    }

    const results = db.advancedSearch(currentUser.id, searchParams);
    return { success: true, results };
  } catch (error) {
    console.error('Error performing advanced search:', error);
    return { success: false, error: error.message };
  }
});

// Firebase Cloud Sync IPC handlers
ipcMain.handle('save-firebase-config', async (event, config) => {
  try {
    // If config is provided, use it; otherwise use default
    const finalConfig = config || DEFAULT_FIREBASE_CONFIG;
    const configPath = path.join(app.getPath('userData'), 'firebase-config.json');
    fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2));

    // Initialize Firebase with config
    firebaseService.initialize(finalConfig);
    firebaseService.setSyncEnabled(true);
    authService.setFirebaseEnabled(true);

    return { success: true };
  } catch (error) {
    console.error('Error saving Firebase config:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-firebase-status', async () => {
  return {
    isInitialized: firebaseService.isReady(),
    isSyncEnabled: firebaseService.isSyncEnabled(),
    currentUser: firebaseService.getCurrentUser() ? firebaseService.getCurrentUser().email : null
  };
});

ipcMain.handle('set-cloud-sync', async (event, enabled) => {
  try {
    firebaseService.setSyncEnabled(enabled);
    return { success: true };
  } catch (error) {
    console.error('Error setting cloud sync:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('firebase-login', async (event, email, password) => {
  try {
    const result = await firebaseService.loginUser(email, password);
    return result;
  } catch (error) {
    console.error('Error with Firebase login:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('firebase-register', async (event, email, password, username) => {
  try {
    const result = await firebaseService.registerUser(email, password, username);
    return result;
  } catch (error) {
    console.error('Error with Firebase registration:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('firebase-logout', async () => {
  try {
    const result = await firebaseService.logoutUser();
    return result;
  } catch (error) {
    console.error('Error with Firebase logout:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-to-cloud', async (event) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }
    return await backUpAllLocalFiles(currentUser);
  } catch (error) {
    console.error('Error syncing to cloud:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-from-cloud', async (event) => {
  const currentUser = authService.getCurrentUser();
  if (!currentUser) return { success: false, error: 'Not authenticated' };
  return restoreCloudBackup(currentUser);
});

// Admin Panel IPC handlers
ipcMain.handle('admin-get-users', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    const result = authService.getAllUsers();
    return result;
  } catch (error) {
    console.error('Error getting users:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-create-user', async (event, userData) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    // Validate required fields
    if (!userData.username || !userData.email || !userData.password) {
      return { success: false, error: 'Username, email, and password are required' };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      return { success: false, error: 'Invalid email format' };
    }

    // Validate password length
    if (userData.password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    // Check if username or email already exists
    const existingUser = db.db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(userData.username, userData.email);
    if (existingUser) {
      return { success: false, error: 'Username or email already exists' };
    }

    // Create user using auth service with specified role
    const result = await authService.registerUser(userData.username, userData.email, userData.password, userData.role);
    
    if (result.success) {
      db.logActivity(currentUser.id, 'ADMIN_USER_CREATED', `Created user: ${userData.username} with role: ${userData.role}`);
      return { success: true, user: result.user };
    } else {
      return { success: false, error: result.error || 'Failed to create user' };
    }
  } catch (error) {
    console.error('Error creating user:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-set-user-role', async (event, userId, role) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    // Prevent admin from changing their own role
    if (userId === currentUser.id) {
      return { success: false, error: 'Cannot change your own role' };
    }

    const result = authService.setUserRole(userId, role);
    return result;
  } catch (error) {
    console.error('Error setting user role:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-deactivate-user', async (event, userId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    // Prevent admin from deactivating themselves
    if (userId === currentUser.id) {
      return { success: false, error: 'Cannot deactivate yourself' };
    }

    const result = authService.deactivateUser(userId);
    return result;
  } catch (error) {
    console.error('Error deactivating user:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-activate-user', async (event, userId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    const result = authService.activateUser(userId);
    return result;
  } catch (error) {
    console.error('Error activating user:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-delete-user', async (event, userId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    // Prevent admin from deleting themselves
    if (userId === currentUser.id) {
      return { success: false, error: 'Cannot delete yourself' };
    }

    const result = authService.adminDeleteUser(userId);
    return result;
  } catch (error) {
    console.error('Error deleting user:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-get-stats', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    const usersResult = authService.getAllUsers();
    if (!usersResult.success) {
      return usersResult;
    }

    const totalUsers = usersResult.users.length;
    const activeUsers = usersResult.users.filter(u => u.is_active).length;
    const adminUsers = usersResult.users.filter(u => u.role === 'admin').length;

    const totalFiles = db.getFileStats().totalFiles;
    const totalSize = db.getFileStats().totalSize;

    return {
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        adminUsers,
        totalFiles,
        totalSize
      }
    };
  } catch (error) {
    console.error('Error getting admin stats:', error);
    return { success: false, error: error.message };
  }
});

// Activity Logs IPC handlers
ipcMain.handle('admin-get-activity-logs', async (event, limit = 100, offset = 0) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    const logs = db.getActivityLogs(limit, offset);
    return { success: true, logs };
  } catch (error) {
    console.error('Error getting activity logs:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-get-activity-logs-by-user', async (event, userId, limit = 50) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    const logs = db.getActivityLogsByUser(userId, limit);
    return { success: true, logs };
  } catch (error) {
    console.error('Error getting activity logs by user:', error);
    return { success: false, error: error.message };
  }
});

// System Settings IPC handlers
ipcMain.handle('admin-get-system-settings', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    const settings = db.getAllSystemSettings();
    return { success: true, settings };
  } catch (error) {
    console.error('Error getting system settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-set-system-setting', async (event, key, value, description) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    const result = db.setSystemSetting(key, value, description, currentUser.id);
    if (result) {
      return { success: true };
    }
    return { success: false, error: 'Failed to set system setting' };
  } catch (error) {
    console.error('Error setting system setting:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-delete-system-setting', async (event, key) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    const result = db.deleteSystemSetting(key);
    if (result) {
      return { success: true };
    }
    return { success: false, error: 'Failed to delete system setting' };
  } catch (error) {
    console.error('Error deleting system setting:', error);
    return { success: false, error: error.message };
  }
});

// Advanced Statistics IPC handler
ipcMain.handle('admin-get-advanced-stats', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    const stats = db.getAdvancedStats();
    if (stats) {
      return { success: true, stats };
    }
    return { success: false, error: 'Failed to get advanced statistics' };
  } catch (error) {
    console.error('Error getting advanced stats:', error);
    return { success: false, error: error.message };
  }
});

// Subscription and Storage IPC handlers
ipcMain.handle('get-user-storage-info', async () => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const storageInfo = db.getUserStorageInfo(currentUser.id);
    if (storageInfo) {
      return { success: true, storageInfo };
    }
    return { success: false, error: 'Failed to get storage info' };
  } catch (error) {
    console.error('Error getting user storage info:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-subscription-plans', async () => {
  try {
    const plans = db.getSubscriptionPlans();
    return { success: true, plans };
  } catch (error) {
    console.error('Error getting subscription plans:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('upgrade-subscription', async (event, planId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const plans = db.getSubscriptionPlans();
    const plan = plans.find(p => p.id === planId);
    if (!plan) {
      return { success: false, error: 'Invalid plan' };
    }

    // Calculate expiration date (1 month from now)
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const result = db.updateUserSubscription(currentUser.id, planId, plan.storage, expiresAt.toISOString());
    if (result) {
      db.logActivity(currentUser.id, 'SUBSCRIPTION_UPGRADED', `Upgraded to ${plan.name} plan`);
      return { success: true, plan };
    }
    return { success: false, error: 'Failed to upgrade subscription' };
  } catch (error) {
    console.error('Error upgrading subscription:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-update-user-subscription', async (event, userId, planId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    const plans = db.getSubscriptionPlans();
    const plan = plans.find(p => p.id === planId);
    if (!plan) {
      return { success: false, error: 'Invalid plan' };
    }

    const result = db.updateUserSubscription(userId, planId, plan.storage, null);
    if (result) {
      db.logActivity(currentUser.id, 'ADMIN_SUBSCRIPTION_UPDATED', `Updated user ${userId} to ${plan.name} plan`);
      return { success: true };
    }
    return { success: false, error: 'Failed to update user subscription' };
  } catch (error) {
    console.error('Error updating user subscription:', error);
    return { success: false, error: error.message };
  }
});

// Admin file management IPC handlers
ipcMain.handle('admin-get-all-files', async (event, userId = null) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    let files;
    if (userId) {
      // Get files for specific user
      files = db.getAllFiles(userId);
    } else {
      // Get all files across all users
      files = db.db.prepare(`
        SELECT f.*, u.username, u.email, fl.name as folder_name, fl.color as folder_color
        FROM files f
        LEFT JOIN users u ON f.user_id = u.id
        LEFT JOIN folders fl ON f.folder_id = fl.id
        ORDER BY f.upload_date DESC
      `).all();
    }

    return { success: true, files };
  } catch (error) {
    console.error('Error getting all files:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-delete-file', async (event, fileId) => {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin only.' };
    }

    const file = db.getFileById(fileId);
    if (!file) {
      return { success: false, error: 'File not found' };
    }

    // Delete physical file if it exists
    if (file.stored_path && fs.existsSync(file.stored_path)) {
      fs.unlinkSync(file.stored_path);
    }

    // Delete from database
    db.deleteFile(fileId);

    // Update user storage
    if (file.user_id) {
      db.updateUserStorageUsed(file.user_id);
    }

    db.logActivity(currentUser.id, 'ADMIN_FILE_DELETED', `Deleted file: ${file.name} (User: ${file.user_id})`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting file:', error);
    return { success: false, error: error.message };
  }
});
