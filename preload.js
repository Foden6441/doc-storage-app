const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveFile: (filePath, metadata) => ipcRenderer.invoke('save-file', filePath, metadata),
  getFiles: () => ipcRenderer.invoke('get-files'),
  deleteFile: (fileId) => ipcRenderer.invoke('delete-file', fileId),
  deleteFiles: (fileIds) => ipcRenderer.invoke('delete-files', fileIds),
  openFile: (fileId) => ipcRenderer.invoke('open-file', fileId),

  // Authentication
  registerUser: (username, email, password) => ipcRenderer.invoke('register-user', username, email, password),
  loginUser: (username, password) => ipcRenderer.invoke('login-user', username, password),
  logoutUser: () => ipcRenderer.invoke('logout-user'),
  checkAuth: () => ipcRenderer.invoke('check-auth'),
  getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
  changePassword: (currentPassword, newPassword) => ipcRenderer.invoke('change-password', currentPassword, newPassword),
  restoreSession: (sessionToken) => ipcRenderer.invoke('restore-session', sessionToken),
  getUserProfile: () => ipcRenderer.invoke('get-user-profile'),
  getSessionInfo: () => ipcRenderer.invoke('get-session-info'),
  logoutOtherSessions: () => ipcRenderer.invoke('logout-other-sessions'),

  // Backup/Restore
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),

  // Folder operations
  createFolder: (folderData) => ipcRenderer.invoke('create-folder', folderData),
  getFolders: () => ipcRenderer.invoke('get-folders'),
  updateFolder: (folderId, updates) => ipcRenderer.invoke('update-folder', folderId, updates),
  deleteFolder: (folderId) => ipcRenderer.invoke('delete-folder', folderId),
  moveFileToFolder: (fileId, folderId) => ipcRenderer.invoke('move-file-to-folder', fileId, folderId),
  getFilesInFolder: (folderId) => ipcRenderer.invoke('get-files-in-folder', folderId),
  addFileToFolder: (folderId) => ipcRenderer.invoke('add-file-to-folder', folderId),
  importFolderFromDevice: (targetFolderId) => ipcRenderer.invoke('import-folder-from-device', targetFolderId),

  // Search operations
  searchFiles: (query, options) => ipcRenderer.invoke('search-files', query, options),
  advancedSearch: (searchParams) => ipcRenderer.invoke('advanced-search', searchParams),

  // Firebase Cloud Sync
  saveFirebaseConfig: (config) => ipcRenderer.invoke('save-firebase-config', config),
  getFirebaseStatus: () => ipcRenderer.invoke('get-firebase-status'),
  setCloudSync: (enabled) => ipcRenderer.invoke('set-cloud-sync', enabled),
  firebaseLogin: (email, password) => ipcRenderer.invoke('firebase-login', email, password),
  firebaseRegister: (email, password, username) => ipcRenderer.invoke('firebase-register', email, password, username),
  firebaseLogout: () => ipcRenderer.invoke('firebase-logout'),
  syncToCloud: () => ipcRenderer.invoke('sync-to-cloud'),
  syncFromCloud: () => ipcRenderer.invoke('sync-from-cloud'),

  // Admin Panel
  adminGetUsers: () => ipcRenderer.invoke('admin-get-users'),
  adminSetUserRole: (userId, role) => ipcRenderer.invoke('admin-set-user-role', userId, role),
  adminDeactivateUser: (userId) => ipcRenderer.invoke('admin-deactivate-user', userId),
  adminActivateUser: (userId) => ipcRenderer.invoke('admin-activate-user', userId),
  adminDeleteUser: (userId) => ipcRenderer.invoke('admin-delete-user', userId),
  adminGetStats: () => ipcRenderer.invoke('admin-get-stats'),
  adminGetActivityLogs: (limit, offset) => ipcRenderer.invoke('admin-get-activity-logs', limit, offset),
  adminGetActivityLogsByUser: (userId, limit) => ipcRenderer.invoke('admin-get-activity-logs-by-user', userId, limit),
  adminGetSystemSettings: () => ipcRenderer.invoke('admin-get-system-settings'),
  adminSetSystemSetting: (key, value, description) => ipcRenderer.invoke('admin-set-system-setting', key, value, description),
  adminDeleteSystemSetting: (key) => ipcRenderer.invoke('admin-delete-system-setting', key),
  adminGetAdvancedStats: () => ipcRenderer.invoke('admin-get-advanced-stats'),
  adminUpdateUserSubscription: (userId, planId) => ipcRenderer.invoke('admin-update-user-subscription', userId, planId),

  // Subscription and Storage
  getUserStorageInfo: () => ipcRenderer.invoke('get-user-storage-info'),
  getSubscriptionPlans: () => ipcRenderer.invoke('get-subscription-plans'),
  upgradeSubscription: (planId) => ipcRenderer.invoke('upgrade-subscription', planId)
});
