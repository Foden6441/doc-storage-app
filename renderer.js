const SESSION_STORAGE_KEY = 'docstore_session_token';

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    const errorMessage = event.error?.message || 'An unexpected error occurred';
    const errorStack = event.error?.stack || '';
    
    // Log error details
    logError('GLOBAL_ERROR', { message: errorMessage, stack: errorStack });
    
    // Show user-friendly error message
    showNotification('An error occurred. Please refresh the page.', 'error');
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    const errorMessage = event.reason?.message || 'An async operation failed';
    
    // Log error details
    logError('UNHANDLED_PROMISE', { message: errorMessage, reason: event.reason });
    
    // Show user-friendly error message
    showNotification('An operation failed. Please try again.', 'error');
});

// Error logging utility
function logError(type, details) {
    const errorLog = {
        timestamp: new Date().toISOString(),
        type: type,
        details: details,
        userAgent: navigator.userAgent,
        url: window.location.href
    };
    
    console.error('[ERROR LOG]', errorLog);
    
    // Store in localStorage for debugging (limit to last 50 errors)
    try {
        const errorLogs = JSON.parse(localStorage.getItem('error_logs') || '[]');
        errorLogs.push(errorLog);
        if (errorLogs.length > 50) {
            errorLogs.shift(); // Remove oldest error
        }
        localStorage.setItem('error_logs', JSON.stringify(errorLogs));
    } catch (e) {
        console.error('Failed to store error log:', e);
    }
}

// User-friendly error messages
const ERROR_MESSAGES = {
    'Invalid file path': 'The selected file could not be accessed. Please choose a different file.',
    'Invalid file name': 'The file name contains invalid characters. Please rename the file.',
    'Invalid folder name': 'The folder name contains invalid characters. Please use only letters, numbers, and spaces.',
    'Invalid email': 'Please enter a valid email address.',
    'Invalid username': 'Username must be 3-30 characters and contain only letters, numbers, and underscores.',
    'Invalid password': 'Password must be 6-128 characters.',
    'Invalid credentials': 'Invalid username or password. Please try again.',
    'User not authenticated': 'Please log in to perform this action.',
    'File not found': 'The requested file could not be found.',
    'Folder not found': 'The requested folder could not be found.',
    'Invalid folder ID': 'Invalid folder selected.',
    'Invalid file ID': 'Invalid file selected.',
    'Failed to create folder': 'Could not create folder. Please try again.',
    'Failed to update folder': 'Could not update folder. Please try again.',
    'Failed to delete folder': 'Could not delete folder. Please try again.',
    'Failed to upload file': 'Could not upload file. Please try again.',
    'Failed to delete file': 'Could not delete file. Please try again.',
    'Network error': 'Network connection lost. Please check your internet connection.',
    'Database error': 'A database error occurred. Please try again.',
    'Session expired': 'Your session has expired. Please log in again.',
    'Too many failed attempts': 'Too many failed login attempts. Please try again later.',
    'default': 'An unexpected error occurred. Please try again.'
};

function getUserFriendlyError(error) {
    const errorMessage = error?.message || error || '';
    
    for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
        if (errorMessage.includes(key) || errorMessage.toLowerCase().includes(key.toLowerCase())) {
            return message;
        }
    }
    
    return ERROR_MESSAGES.default;
}

class DocumentStorageApp {
    constructor() {
        this.files = [];
        this.folders = [];
        this.currentUser = null;
        this.currentFolder = null;
        this.searchTimeout = null;
        this.selectedFileIds = new Set();
        this.currentView = 'home';
        this.currentMoreTab = 'settings';
        this.init();
    }

    async init() {
        try {
            await this.checkAuthentication();

            // Wait for DOM to be fully loaded
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            initAppSettings();
            this.setupEventListeners();

            if (this.currentUser) {
                this.loadFolders();
                this.loadFiles();
                this.updateStats();
                this.loadStorageInfo();

                // Show the Super Admin workspace only to privileged accounts.
                if (this.currentUser.role === 'admin') {
                    const adminNavBtn = document.getElementById('nav-admin-btn');
                    if (adminNavBtn) {
                        adminNavBtn.style.display = 'inline-flex';
                    }
                }
            }
        } catch (error) {
            console.error('Initialization error:', error);
            logError('INIT_ERROR', { message: error.message, stack: error.stack });
            this.showNotification(getUserFriendlyError(error), 'error');
        }
    }

    // Helper method to show error notifications with user-friendly messages
    showError(error, context = '') {
        const friendlyMessage = getUserFriendlyError(error);
        const message = context ? `${context}: ${friendlyMessage}` : friendlyMessage;
        this.showNotification(message, 'error');
        logError('OPERATION_ERROR', { context, error: error.message, stack: error.stack });
    }

    setupEventListeners() {
        // Check if search input exists
        const searchInput = document.getElementById('search-input');
        if (!searchInput) {
            console.error('Search input not found!');
            return;
        }

        // Sidebar toggle button
        const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
        if (sidebarToggleBtn) {
            sidebarToggleBtn.addEventListener('click', () => {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) {
                    sidebar.classList.toggle('collapsed');
                }
            });
        }

        // Upload button
        document.getElementById('upload-btn').addEventListener('click', () => {
            this.handleFileUpload();
        });

        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadFiles();
        });

        // Logout button
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.handleLogout();
        });

        this.setupMoreNavigation();
        this.setupSettingsListeners();

        document.getElementById('change-password-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleChangePassword();
        });

        document.getElementById('refresh-session-btn').addEventListener('click', () => {
            this.loadSessionPanel();
        });

        document.getElementById('logout-other-sessions-btn').addEventListener('click', () => {
            this.handleLogoutOtherSessions();
        });

        document.getElementById('more-logout-btn').addEventListener('click', () => {
            this.handleLogout();
        });

        // Create folder button
        document.getElementById('create-folder-btn').addEventListener('click', () => {
            this.showCreateFolderModal();
        });

        // Import folder button
        document.getElementById('import-folder-btn').addEventListener('click', () => {
            this.handleImportFolder();
        });

        // Search functionality - simplified approach
        this.initializeSearchInput();

        document.getElementById('clear-search-btn').addEventListener('click', () => {
            this.clearSearch();
        });

        document.getElementById('advanced-search-btn').addEventListener('click', () => {
            this.showAdvancedSearchModal();
        });

        // Search tabs
        document.querySelectorAll('.search-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchSearchTab(e.target.dataset.tab);
            });
        });

        // Search filters
        document.getElementById('search-type-filter').addEventListener('change', () => {
            this.applySearchFilters();
        });

        document.getElementById('file-type-filter').addEventListener('change', () => {
            this.applySearchFilters();
        });

        document.getElementById('select-all-files-btn').addEventListener('click', () => {
            this.selectAllVisibleFiles();
        });

        document.getElementById('clear-file-selection-btn').addEventListener('click', () => {
            this.clearFileSelection();
        });

        document.getElementById('delete-selected-files-btn').addEventListener('click', () => {
            this.deleteSelectedFiles();
        });

        // Upload area drag and drop
        const uploadArea = document.getElementById('upload-area');
        
        uploadArea.addEventListener('click', () => {
            this.handleFileUpload();
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileUpload(files[0].path);
            }
        });
    }

    async handleFileUpload(filePath = null) {
        try {
            let selectedPath = filePath;
            
            if (!selectedPath) {
                selectedPath = await window.electronAPI.selectFile();
            }

            if (selectedPath) {
                this.showLoadingState();
                
                const metadata = {
                    description: '',
                    tags: [],
                    folderId: this.currentFolder ? this.currentFolder.id : null
                };

                const result = await window.electronAPI.saveFile(selectedPath, metadata);
                
                if (result.success) {
                    if (result.cloudBackup?.success) {
                        this.showNotification('File saved on this computer and backed up to your cloud account.', 'success');
                    } else if (result.cloudBackup?.skipped) {
                        this.showNotification('File saved on this computer. Cloud backup is not connected for this account.', 'info');
                    } else {
                        this.showNotification(`File saved on this computer. Cloud backup did not complete; retry it later from Settings > Back Up Now. Details: ${result.cloudBackup?.error || 'Unknown error'}`, 'info');
                    }
                    if (this.currentFolder) {
                        this.loadFilesInFolder(this.currentFolder.id);
                    } else {
                        this.loadFiles();
                    }
                } else {
                    this.showError(result.error, 'Upload failed');
                }
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            this.showError(error, 'File upload');
        }
    }

    async loadFolders() {
        try {
            this.folders = await window.electronAPI.getFolders();
            this.renderFolders();
        } catch (error) {
            console.error('Error loading folders:', error);
            this.showError(error, 'Load folders');
        }
    }

    async loadFiles() {
        try {
            this.showLoadingState();
            this.files = await window.electronAPI.getFiles();
            this.renderFiles();
            this.updateStats();
        } catch (error) {
            console.error('Error loading files:', error);
            this.showError(error, 'Load files');
        }
    }

    async loadFilesInFolder(folderId) {
        try {
            this.showLoadingState();
            this.files = await window.electronAPI.getFilesInFolder(folderId);
            this.renderFiles();
            this.updateStats();
        } catch (error) {
            console.error('Error loading files in folder:', error);
            this.showError(error, 'Load files');
        }
    }

    renderFiles() {
        const fileList = document.getElementById('file-list');
        
        if (this.files.length === 0) {
            fileList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📁</div>
                    <h3>No files yet</h3>
                    <p>Upload your first document to get started!</p>
                </div>
            `;
            this.updateBulkActionsBar();
            return;
        }

        fileList.innerHTML = this.files.map(file => this.createFileCard(file)).join('');
        this.attachFileEventListeners(this.files);
        this.updateBulkActionsBar();
    }

    setFileSelected(fileId, selected) {
        if (selected) {
            this.selectedFileIds.add(fileId);
        } else {
            this.selectedFileIds.delete(fileId);
        }

        document.querySelectorAll(`.file-card[data-file-id="${fileId}"]`).forEach(card => {
            card.classList.toggle('selected', selected);
            const checkbox = card.querySelector('.file-select-checkbox');
            if (checkbox) {
                checkbox.checked = selected;
            }
        });

        this.updateBulkActionsBar();
    }

    selectAllVisibleFiles() {
        const searchResults = document.getElementById('search-results');
        const searchIsVisible = searchResults && searchResults.classList.contains('show');

        if (searchIsVisible) {
            document.querySelectorAll('#search-files-list .file-select-checkbox').forEach(checkbox => {
                const fileId = parseInt(checkbox.dataset.fileId, 10);
                this.setFileSelected(fileId, true);
            });
            return;
        }

        this.files.forEach(file => this.selectedFileIds.add(file.id));
        this.renderFiles();
    }

    clearFileSelection() {
        this.selectedFileIds.clear();
        document.querySelectorAll('.file-select-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        document.querySelectorAll('.file-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
        this.updateBulkActionsBar();
    }

    updateBulkActionsBar() {
        const bar = document.getElementById('file-bulk-actions');
        const countEl = document.getElementById('file-selection-count');
        const deleteBtn = document.getElementById('delete-selected-files-btn');
        const count = this.selectedFileIds.size;

        if (!bar || !countEl || !deleteBtn) {
            return;
        }

        const searchResults = document.getElementById('search-results');
        const searchIsVisible = searchResults && searchResults.classList.contains('show');
        const searchFileCount = document.querySelectorAll('#search-files-list .file-card').length;
        const hasFiles = this.files.length > 0 || (searchIsVisible && searchFileCount > 0);
        bar.classList.toggle('hidden', !hasFiles);
        countEl.textContent = count === 1 ? '1 file selected' : `${count} files selected`;
        deleteBtn.disabled = count === 0;
    }

    async deleteSelectedFiles() {
        const fileIds = Array.from(this.selectedFileIds);

        if (fileIds.length === 0) {
            this.showNotification('Select one or more files to delete.', 'error');
            return;
        }

        const label = fileIds.length === 1 ? 'this file' : `${fileIds.length} files`;
        if (!confirm(`Delete ${label}? This cannot be undone.`)) {
            return;
        }

        try {
            const result = await window.electronAPI.deleteFiles(fileIds);

            if (result.success) {
                this.selectedFileIds.clear();
                this.updateBulkActionsBar();
                this.showNotification(
                    `Deleted ${result.deleted} file(s) successfully.`,
                    'success'
                );

                const searchQuery = document.getElementById('search-input').value.trim();
                if (searchQuery) {
                    await this.handleSearch(searchQuery);
                }

                this.refreshCurrentFileView();
            } else {
                this.showNotification(
                    'Could not delete selected files: ' + (result.error || 'Unknown error'),
                    'error'
                );
            }
        } catch (error) {
            console.error('Error deleting selected files:', error);
            this.showError(error, 'Delete files');
        }
    }

    createFileCard(file) {
        const fileIcon = this.getFileIcon(file.name);
        const fileSize = this.formatFileSize(file.size);
        const uploadDate = new Date(file.uploadDate).toLocaleDateString();
        const folderInfo = file.folderName ? `<div style="color: ${file.folderColor || '#3498db'}; font-size: 0.8em; margin-bottom: 5px;">📁 ${file.folderName}</div>` : '';
        const isSelected = this.selectedFileIds.has(file.id);
        
        return `
            <div class="file-card ${isSelected ? 'selected' : ''}" data-file-id="${file.id}">
                <label class="file-select-label">
                    <input type="checkbox" class="file-select-checkbox" data-file-id="${file.id}" ${isSelected ? 'checked' : ''}>
                    <span>Select for delete</span>
                </label>
                <div class="file-icon">${fileIcon}</div>
                <div class="file-name">${file.name}</div>
                ${folderInfo}
                <div class="file-info">
                    <div>Size: ${fileSize}</div>
                    <div>Uploaded: ${uploadDate}</div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-small open-file-btn">📂 Open</button>
                    <button class="btn btn-small move-to-folder-btn" style="background: linear-gradient(135deg, #3498db, #2980b9);">📁 Add to Folder</button>
                    <button class="btn btn-small btn-danger delete-file-btn">🗑️ Delete</button>
                </div>
            </div>
        `;
    }

    getFileIcon(fileName) {
        const extension = fileName.split('.').pop().toLowerCase();
        
        const iconMap = {
            'pdf': '📄',
            'doc': '📝',
            'docx': '📝',
            'txt': '📄',
            'rtf': '📄',
            'jpg': '🖼️',
            'jpeg': '🖼️',
            'png': '🖼️',
            'gif': '🖼️',
            'bmp': '🖼️',
            'mp4': '🎥',
            'avi': '🎥',
            'mov': '🎥',
            'mp3': '🎵',
            'wav': '🎵',
            'zip': '📦',
            'rar': '📦',
            '7z': '📦'
        };
        
        return iconMap[extension] || '📁';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateStats() {
        const totalFiles = this.files.length;
        const totalSize = this.files.reduce((sum, file) => sum + (file.size || 0), 0);
        
        document.getElementById('total-files').textContent = totalFiles;
        document.getElementById('total-size').textContent = this.formatFileSize(totalSize);
    }

    async openFile(fileId) {
        try {
            const result = await window.electronAPI.openFile(fileId);
            
            if (!result.success) {
                this.showError(result.error, 'Open file');
            }
        } catch (error) {
            console.error('Error opening file:', error);
            this.showError(error, 'Open file');
        }
    }

    async deleteFile(fileId) {
        if (!confirm('Are you sure you want to delete this file?')) {
            return;
        }
        
        try {
            const result = await window.electronAPI.deleteFile(fileId);
            
            if (result.success) {
                this.selectedFileIds.delete(fileId);
                this.updateBulkActionsBar();
                this.showNotification('File deleted successfully!', 'success');

                const searchQuery = document.getElementById('search-input').value.trim();
                if (searchQuery) {
                    await this.handleSearch(searchQuery);
                }

                this.refreshCurrentFileView();
            } else {
                this.showError(result.error, 'Delete file');
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            this.showError(error, 'Delete file');
        }
    }

    renderFolders() {
        const foldersList = document.getElementById('folders-list');
        
        if (this.folders.length === 0) {
            foldersList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📁</div>
                    <h3>No folders yet</h3>
                    <p>Create your first folder to organize your documents!</p>
                </div>
            `;
            return;
        }

        foldersList.innerHTML = this.folders.map(folder => this.createFolderCard(folder)).join('');
        
        // Add event listeners to folder cards
        this.folders.forEach(folder => {
            const folderCard = document.querySelector(`[data-folder-id="${folder.id}"]`);
            const menuBtn = folderCard.querySelector('.folder-menu-btn');
            const menu = folderCard.querySelector('.folder-menu');
            
            folderCard.addEventListener('click', (e) => {
                if (!e.target.closest('.folder-menu')) {
                    this.selectFolder(folder.id);
                }
            });
            
            if (menuBtn) {
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleFolderMenu(folder.id);
                });
            }
        });
    }

    createFolderCard(folder) {
        const isActive = this.currentFolder && this.currentFolder.id === folder.id;

        return `
            <div class="folder-card ${isActive ? 'active' : ''}" data-folder-id="${folder.id}">
                <div class="folder-icon" style="color: ${folder.color}">📁</div>
                <div class="folder-name">${folder.name}</div>
                <div class="folder-description">${folder.description || 'No description'}</div>
                <div class="folder-actions">
                    <button class="btn btn-small" onclick="app.addFileToFolder(${folder.id})" style="background: linear-gradient(135deg, #27ae60, #2ecc71);">📤 Add Files</button>
                    <button class="btn btn-small" onclick="app.handleEditFolder(${folder.id})">✏️ Edit</button>
                    <button class="btn btn-small btn-danger" onclick="app.handleDeleteFolder(${folder.id})">🗑️ Delete</button>
                </div>
                <button class="folder-menu-btn" style="position: absolute; top: 10px; right: 10px; background: none; border: none; cursor: pointer; font-size: 1.2em;">⋮</button>
                <div class="folder-menu">
                    <div class="folder-menu-item" onclick="app.addFileToFolder(${folder.id})">📤 Add Files to Folder</div>
                    <div class="folder-menu-item" onclick="app.importFolderIntoFolder(${folder.id})">📂 Import Folder Here</div>
                    <div class="folder-menu-item" onclick="app.handleEditFolder(${folder.id})">✏️ Edit Folder</div>
                    <div class="folder-menu-item danger" onclick="app.handleDeleteFolder(${folder.id})">🗑️ Delete Folder</div>
                </div>
            </div>
        `;
    }

    selectFolder(folderId) {
        this.currentFolder = this.folders.find(f => f.id === folderId);

        // Update active state
        document.querySelectorAll('.folder-card').forEach(card => {
            card.classList.remove('active');
        });

        const activeCard = document.querySelector(`[data-folder-id="${folderId}"]`);
        if (activeCard) {
            activeCard.classList.add('active');
        }

        // Update the files section title to show current folder
        this.updateFilesSectionTitle();

        // Update upload area to show current folder
        this.updateUploadArea();

        // Load files in this folder
        this.loadFilesInFolder(folderId);
    }

    updateUploadArea() {
        const uploadArea = document.getElementById('upload-area');
        if (this.currentFolder) {
            uploadArea.innerHTML = `
                <div class="upload-icon">📁</div>
                <div class="upload-text">Drop files to add to "${this.currentFolder.name}"</div>
                <div class="upload-subtext">or click to browse</div>
            `;
        } else {
            uploadArea.innerHTML = `
                <div class="upload-icon">📁</div>
                <div class="upload-text">Drag & Drop files here</div>
                <div class="upload-subtext">or click to browse</div>
            `;
        }
    }

    updateFilesSectionTitle() {
        const filesSection = document.querySelector('.files-section .section-title');
        if (this.currentFolder) {
            filesSection.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span>📁 Files in "${this.currentFolder.name}"</span>
                    <button class="btn btn-small btn-secondary" onclick="app.showAllFiles()" style="margin-left: auto;">
                        ← Back to All Files
                    </button>
                </div>
            `;
        } else {
            filesSection.innerHTML = '📋 Your Files';
        }
    }

    showAllFiles() {
        this.currentFolder = null;

        // Remove active state from all folder cards
        document.querySelectorAll('.folder-card').forEach(card => {
            card.classList.remove('active');
        });

        // Update title and upload area
        this.updateFilesSectionTitle();
        this.updateUploadArea();

        // Load all files
        this.loadFiles();
    }

    toggleFolderMenu(folderId) {
        const folderCard = document.querySelector(`[data-folder-id="${folderId}"]`);
        const menu = folderCard.querySelector('.folder-menu');
        menu.classList.toggle('show');
    }

    showCreateFolderModal() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 15px; padding: 30px; width: 90%; max-width: 500px;">
                <h2 style="margin-bottom: 20px; color: #2c3e50;">Create New Folder</h2>
                <form id="create-folder-form">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; color: #2c3e50; font-weight: 500;">Folder Name</label>
                        <input type="text" id="folder-name" required style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 1em;">
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; color: #2c3e50; font-weight: 500;">Description (Optional)</label>
                        <textarea id="folder-description" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 1em; height: 80px; resize: vertical;"></textarea>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; color: #2c3e50; font-weight: 500;">Color</label>
                        <input type="color" id="folder-color" value="#3498db" style="width: 100%; height: 40px; border: none; border-radius: 8px;">
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px;">
                        <button type="button" id="cancel-create-folder" class="modal-btn cancel" title="Cancel folder creation (Esc)">
                            ✖️ Cancel
                        </button>
                        <button type="submit" id="create-folder-submit" class="modal-btn primary" title="Create new folder (Ctrl+Enter)">
                            📁 Create Folder
                        </button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);

        // Add event listeners for buttons
        const cancelBtn = modal.querySelector('#cancel-create-folder');
        const form = modal.querySelector('#create-folder-form');

        // Cancel button functionality
        cancelBtn.addEventListener('click', () => {
            this.cancelCreateFolder(modal);
        });

        // Form submit functionality
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleCreateFolder(modal);
        });

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.cancelCreateFolder(modal);
            }
        });

        // Focus on name input
        document.getElementById('folder-name').focus();

        // Add keyboard shortcuts
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.cancelCreateFolder(modal);
            } else if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                form.dispatchEvent(new Event('submit'));
            }
        });
    }

    cancelCreateFolder(modal) {
        // Show confirmation if user has entered data
        const nameInput = document.getElementById('folder-name');
        const descInput = document.getElementById('folder-description');

        const hasData = nameInput.value.trim() || descInput.value.trim();

        if (hasData) {
            const confirmCancel = confirm('Are you sure you want to cancel? Any entered data will be lost.');
            if (!confirmCancel) {
                return;
            }
        }

        // Close the modal
        modal.remove();
        this.showNotification('Folder creation cancelled', 'info');
    }

    async handleCreateFolder(modal) {
        const nameInput = document.getElementById('folder-name');
        const descInput = document.getElementById('folder-description');
        const colorInput = document.getElementById('folder-color');
        const submitBtn = document.getElementById('create-folder-submit');

        const name = nameInput.value;
        const description = descInput.value;
        const color = colorInput.value;

        // Validate input
        if (!name.trim()) {
            this.showNotification('Please enter a folder name', 'error');
            nameInput.focus();
            nameInput.style.borderColor = '#e74c3c';
            return;
        }

        // Show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Creating...';

        try {
            const result = await window.electronAPI.createFolder({
                name: name.trim(),
                description: description.trim(),
                color: color
            });
            
            if (result.success) {
                this.showNotification('Folder created successfully!', 'success');
                this.loadFolders();
                modal.remove();
            } else {
                this.showError(result.error, 'Create folder');
                // Reset button state
                submitBtn.disabled = false;
                submitBtn.innerHTML = '📁 Create Folder';
            }
        } catch (error) {
            console.error('Error creating folder:', error);
            this.showError(error, 'Create folder');
            // Reset button state
            submitBtn.disabled = false;
            submitBtn.innerHTML = '📁 Create Folder';
        }
    }

    async handleEditFolder(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        if (!folder) return;

        // Similar modal to create folder but with pre-filled values
        this.showEditFolderModal(folder);
    }

    showEditFolderModal(folder) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        modal.innerHTML = `
            <div style="
                background: white;
                padding: 30px;
                border-radius: 15px;
                width: 90%;
                max-width: 500px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            ">
                <h2 style="margin-bottom: 20px; color: #2c3e50;">✏️ Edit Folder</h2>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">Folder Name:</label>
                    <input type="text" id="edit-folder-name" value="${folder.name}" style="
                        width: 100%;
                        padding: 12px;
                        border: 2px solid #e0e0e0;
                        border-radius: 8px;
                        font-size: 1em;
                        outline: none;
                        transition: border-color 0.3s ease;
                    " placeholder="Enter folder name">
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">Description:</label>
                    <textarea id="edit-folder-description" style="
                        width: 100%;
                        padding: 12px;
                        border: 2px solid #e0e0e0;
                        border-radius: 8px;
                        font-size: 1em;
                        outline: none;
                        transition: border-color 0.3s ease;
                        resize: vertical;
                        min-height: 80px;
                    " placeholder="Enter folder description">${folder.description || ''}</textarea>
                </div>

                <div style="margin-bottom: 25px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">Color:</label>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        ${['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#34495e', '#e67e22'].map(color => `
                            <div style="
                                width: 40px;
                                height: 40px;
                                background: ${color};
                                border-radius: 50%;
                                cursor: pointer;
                                border: 3px solid ${color === folder.color ? '#2c3e50' : 'transparent'};
                                transition: all 0.3s ease;
                            " onclick="this.selectColor('${color}', this)"></div>
                        `).join('')}
                    </div>
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px;">
                    <button id="cancel-edit-folder" class="modal-btn cancel" title="Cancel editing (Esc)">
                        ✖️ Cancel
                    </button>
                    <button id="update-folder-btn" data-folder-id="${folder.id}" class="modal-btn update" title="Save changes (Ctrl+Enter)">
                        ✏️ Update Folder
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Store selected color and original data
        this.selectedColor = folder.color;
        this.originalFolderData = {
            name: folder.name,
            description: folder.description || '',
            color: folder.color
        };

        // Add event listeners for buttons
        const cancelBtn = modal.querySelector('#cancel-edit-folder');
        const updateBtn = modal.querySelector('#update-folder-btn');

        // Cancel button functionality
        cancelBtn.addEventListener('click', () => {
            this.cancelEditFolder(modal);
        });

        // Update button functionality
        updateBtn.addEventListener('click', () => {
            const folderId = updateBtn.getAttribute('data-folder-id');
            this.updateFolder(parseInt(folderId));
        });

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.cancelEditFolder(modal);
            }
        });

        // Focus on name input
        document.getElementById('edit-folder-name').focus();

        // Add keyboard shortcuts
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.cancelEditFolder(modal);
            } else if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                const folderId = updateBtn.getAttribute('data-folder-id');
                this.updateFolder(parseInt(folderId));
            }
        });
    }

    cancelEditFolder(modal) {
        // Check if user has made changes
        const nameInput = document.getElementById('edit-folder-name');
        const descInput = document.getElementById('edit-folder-description');

        const hasChanges =
            nameInput.value !== this.originalFolderData.name ||
            descInput.value !== this.originalFolderData.description ||
            this.selectedColor !== this.originalFolderData.color;

        if (hasChanges) {
            const confirmCancel = confirm('Are you sure you want to cancel? Any changes will be lost.');
            if (!confirmCancel) {
                return;
            }
        }

        // Close the modal
        modal.remove();
        this.showNotification('Folder editing cancelled', 'info');

        // Reset original data
        this.originalFolderData = null;
    }

    selectColor(color, element) {
        // Remove border from all color elements
        const colorElements = element.parentNode.querySelectorAll('div');
        colorElements.forEach(el => {
            el.style.border = '3px solid transparent';
        });

        // Add border to selected element
        element.style.border = '3px solid #2c3e50';
        this.selectedColor = color;
    }

    async updateFolder(folderId) {
        const nameInput = document.getElementById('edit-folder-name');
        const descInput = document.getElementById('edit-folder-description');
        const updateBtn = document.getElementById('update-folder-btn');

        const name = nameInput.value;
        const description = descInput.value;

        // Validate input
        if (!name.trim()) {
            this.showNotification('Please enter a folder name', 'error');
            nameInput.focus();
            nameInput.style.borderColor = '#e74c3c';
            return;
        }

        // Show loading state
        updateBtn.disabled = true;
        updateBtn.innerHTML = '⏳ Updating...';

        try {
            const result = await window.electronAPI.updateFolder(folderId, {
                name: name.trim(),
                description: description.trim(),
                color: this.selectedColor
            });

            if (result.success) {
                this.showNotification('Folder updated successfully!', 'success');
                this.loadFolders();

                // Close the modal properly
                const modal = document.querySelector('div[style*="position: fixed"]');
                if (modal) {
                    modal.remove();
                }

                // Reset original data
                this.originalFolderData = null;
            } else {
                this.showError(result.error, 'Update folder');
                // Reset button state
                updateBtn.disabled = false;
                updateBtn.innerHTML = '✏️ Update Folder';
            }
        } catch (error) {
            console.error('Error updating folder:', error);
            this.showError(error, 'Update folder');
            // Reset button state
            updateBtn.disabled = false;
            updateBtn.innerHTML = '✏️ Update Folder';
        }
    }

    async addFileToFolder(folderId) {
        try {
            // Set the current folder temporarily for file upload
            const originalFolder = this.currentFolder;
            this.currentFolder = this.folders.find(f => f.id === folderId);

            // Trigger file selection
            const selectedPath = await window.electronAPI.selectFile();

            if (selectedPath) {
                this.showLoadingState();

                const metadata = {
                    description: '',
                    tags: [],
                    folderId: folderId
                };

                const result = await window.electronAPI.saveFile(selectedPath, metadata);

                if (result.success) {
                    this.showNotification(`File uploaded to "${this.currentFolder.name}" successfully!`, 'success');

                    // If we're currently viewing this folder, refresh the files
                    if (originalFolder && originalFolder.id === folderId) {
                        this.loadFilesInFolder(folderId);
                    } else {
                        // Otherwise, refresh all files
                        this.loadFiles();
                    }
                } else {
                    this.showError(result.error, 'Upload file');
                }
            }

            // Restore original folder selection
            this.currentFolder = originalFolder;

        } catch (error) {
            console.error('Error adding file to folder:', error);
            this.showError(error, 'Add file to folder');
        }
    }

    refreshCurrentFileView() {
        if (this.currentFolder) {
            this.loadFilesInFolder(this.currentFolder.id);
        } else {
            this.loadFiles();
        }
        this.updateStats();
    }

    async handleImportFolder() {
        try {
            const targetFolderId = await this.promptImportTargetFolder();
            if (targetFolderId === undefined) {
                return;
            }

            this.showNotification('Selecting folder to import...', 'info');

            const result = await window.electronAPI.importFolderFromDevice(targetFolderId);

            if (result.success) {
                this.showImportProgress('Importing folder...');

                // Simulate some processing time for better UX
                await new Promise(resolve => setTimeout(resolve, 1000));

                this.hideImportProgress();
                this.showNotification(
                    `Successfully imported "${result.folderName}" with ${result.importedFiles} files!`,
                    'success'
                );

                // Refresh folders and files
                this.loadFolders();
                this.loadFiles();
                this.updateStats();
            } else {
                if (result.error !== 'No folder selected') {
                    this.showError(result.error, 'Import folder');
                }
            }
        } catch (error) {
            this.hideImportProgress();
            console.error('Error importing folder:', error);
            this.showError(error, 'Import folder');
        }
    }

    async importFolderIntoFolder(targetFolderId) {
        try {
            const targetFolder = this.folders.find(f => f.id === targetFolderId);
            if (!targetFolder) {
                this.showNotification('Target folder not found', 'error');
                return;
            }

            this.showNotification(`Selecting folder to import into "${targetFolder.name}"...`, 'info');

            const result = await window.electronAPI.importFolderFromDevice(targetFolderId);

            if (result.success) {
                this.showImportProgress(`Importing into "${targetFolder.name}"...`);

                // Simulate some processing time for better UX
                await new Promise(resolve => setTimeout(resolve, 1000));

                this.hideImportProgress();
                this.showNotification(
                    `Successfully imported ${result.importedFiles} files into "${targetFolder.name}"!`,
                    'success'
                );

                // If we're currently viewing this folder, refresh it
                if (this.currentFolder && this.currentFolder.id === targetFolderId) {
                    this.loadFilesInFolder(targetFolderId);
                } else {
                    this.loadFiles();
                }
                this.updateStats();
            } else {
                if (result.error !== 'No folder selected') {
                    this.showError(result.error, 'Import folder');
                }
            }
        } catch (error) {
            this.hideImportProgress();
            console.error('Error importing folder into folder:', error);
            this.showError(error, 'Import folder');
        }
    }

    showImportProgress(message = 'Importing...') {
        const overlay = document.createElement('div');
        overlay.className = 'import-progress-overlay';
        overlay.id = 'import-progress-overlay';

        const progress = document.createElement('div');
        progress.className = 'import-progress';
        progress.innerHTML = `
            <div class="spinner"></div>
            <h3 style="margin: 0 0 10px 0; color: #2c3e50;">${message}</h3>
            <p style="margin: 0; color: #7f8c8d;">Please wait while we process your folder...</p>
        `;

        overlay.appendChild(progress);
        document.body.appendChild(overlay);
    }

    hideImportProgress() {
        const overlay = document.getElementById('import-progress-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    async handleSearch(query) {
        if (!query || query.trim().length === 0) {
            this.clearSearch();
            return;
        }

        try {
            const searchType = document.getElementById('search-type-filter').value;
            const fileType = document.getElementById('file-type-filter').value;

            const options = {
                limit: 50
            };

            const results = await window.electronAPI.searchFiles(query.trim(), options);

            // Filter results based on search type
            let filteredResults = { files: results.files, folders: results.folders };

            if (searchType === 'files') {
                filteredResults.folders = [];
            } else if (searchType === 'folders') {
                filteredResults.files = [];
            }

            // Filter files by type if specified
            if (fileType && filteredResults.files.length > 0) {
                filteredResults.files = filteredResults.files.filter(file => {
                    const type = file.fileType?.toLowerCase() || '';
                    switch (fileType) {
                        case 'pdf': return type === 'pdf';
                        case 'doc': return ['doc', 'docx', 'txt', 'rtf'].includes(type);
                        case 'image': return ['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(type);
                        case 'text': return ['txt', 'md', 'rtf'].includes(type);
                        default: return true;
                    }
                });
            }

            this.displaySearchResults(filteredResults, query);
        } catch (error) {
            console.error('Error searching:', error);
            this.showError(error, 'Search');
        }
    }

    displaySearchResults(results, query) {
        const searchResults = document.getElementById('search-results');
        const searchResultsCount = document.getElementById('search-results-count');
        const searchFilesContent = document.getElementById('search-files-list');
        const searchFoldersContent = document.getElementById('search-folders-list');

        // Show search results section
        searchResults.classList.add('show');

        // Update results count
        const totalResults = results.files.length + results.folders.length;
        searchResultsCount.textContent = `${totalResults} result(s) for "${query}"`;

        // Display files
        if (results.files.length > 0) {
            searchFilesContent.innerHTML = results.files.map(file => this.createFileCard(file)).join('');
            this.attachFileEventListeners(results.files);
        } else {
            searchFilesContent.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>No files found</p></div>';
        }

        // Display folders
        if (results.folders.length > 0) {
            searchFoldersContent.innerHTML = results.folders.map(folder => this.createFolderCard(folder)).join('');
            this.attachFolderEventListeners(results.folders);
        } else {
            searchFoldersContent.innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div><p>No folders found</p></div>';
        }

        // Update tab visibility
        this.updateSearchTabVisibility(results);
    }

    updateSearchTabVisibility(results) {
        const filesTab = document.querySelector('[data-tab="files"]');
        const foldersTab = document.querySelector('[data-tab="folders"]');

        // Update tab text with counts
        filesTab.textContent = `📄 Files (${results.files.length})`;
        foldersTab.textContent = `📁 Folders (${results.folders.length})`;

        // Show appropriate tab if current tab has no results
        const activeTab = document.querySelector('.search-tab.active').dataset.tab;
        if (activeTab === 'files' && results.files.length === 0 && results.folders.length > 0) {
            this.switchSearchTab('folders');
        } else if (activeTab === 'folders' && results.folders.length === 0 && results.files.length > 0) {
            this.switchSearchTab('files');
        }
    }

    switchSearchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.search-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.search-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`search-${tabName}-content`).classList.add('active');
    }

    clearSearch() {
        document.getElementById('search-input').value = '';
        document.getElementById('search-results').classList.remove('show');
        this.pruneFileSelectionToVisibleFiles();

        // Reset filters
        document.getElementById('search-type-filter').value = 'all';
        document.getElementById('file-type-filter').value = '';
    }

    pruneFileSelectionToVisibleFiles() {
        const visibleIds = new Set(this.files.map(file => file.id));
        Array.from(this.selectedFileIds).forEach(fileId => {
            if (!visibleIds.has(fileId)) {
                this.selectedFileIds.delete(fileId);
            }
        });
        this.updateBulkActionsBar();
    }

    applySearchFilters() {
        const query = document.getElementById('search-input').value;
        if (query && query.trim().length >= 1) {
            this.handleSearch(query);
        }
    }

    attachFileEventListeners(files) {
        files.forEach(file => {
            document.querySelectorAll(`.file-card[data-file-id="${file.id}"]`).forEach(fileCard => {
                const checkbox = fileCard.querySelector('.file-select-checkbox');
                const openBtn = fileCard.querySelector('.open-file-btn');
                const moveBtn = fileCard.querySelector('.move-to-folder-btn');
                const deleteBtn = fileCard.querySelector('.delete-file-btn');

                if (checkbox) {
                    checkbox.addEventListener('change', (e) => {
                        this.setFileSelected(file.id, e.target.checked);
                    });
                }

                if (openBtn) {
                    openBtn.addEventListener('click', () => this.openFile(file.id));
                }

                if (moveBtn) {
                    moveBtn.addEventListener('click', () => this.showMoveToFolderModal(file.id, file));
                }

                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => this.deleteFile(file.id));
                }
            });
        });

        this.updateBulkActionsBar();
    }

    attachFolderEventListeners(folders) {
        folders.forEach(folder => {
            const folderCard = document.querySelector(`[data-folder-id="${folder.id}"]`);
            if (folderCard) {
                folderCard.addEventListener('click', (e) => {
                    if (!e.target.closest('.folder-menu') && !e.target.closest('.folder-actions')) {
                        this.selectFolder(folder.id);
                        this.clearSearch(); // Clear search when selecting a folder
                    }
                });
            }
        });
    }

    showAdvancedSearchModal() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        modal.innerHTML = `
            <div style="
                background: white;
                padding: 30px;
                border-radius: 15px;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            ">
                <h2 style="margin-bottom: 20px; color: #2c3e50;">🔍 Advanced Search</h2>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">File Name:</label>
                        <input type="text" id="adv-file-name" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    </div>

                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">File Type:</label>
                        <select id="adv-file-type" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px;">
                            <option value="">All Types</option>
                            <option value="pdf">PDF</option>
                            <option value="doc">Word Document</option>
                            <option value="docx">Word Document (DOCX)</option>
                            <option value="txt">Text File</option>
                            <option value="jpg">JPEG Image</option>
                            <option value="png">PNG Image</option>
                            <option value="gif">GIF Image</option>
                        </select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">Folder:</label>
                        <select id="adv-folder" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px;">
                            <option value="">All Folders</option>
                            ${this.folders.map(folder => `<option value="${folder.id}">${folder.name}</option>`).join('')}
                        </select>
                    </div>

                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">Tags:</label>
                        <input type="text" id="adv-tags" placeholder="e.g., important, work" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">Description:</label>
                    <input type="text" id="adv-description" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px;">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">Date From:</label>
                        <input type="date" id="adv-date-from" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    </div>

                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">Date To:</label>
                        <input type="date" id="adv-date-to" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">Min Size (KB):</label>
                        <input type="number" id="adv-size-min" min="0" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    </div>

                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #2c3e50;">Max Size (KB):</label>
                        <input type="number" id="adv-size-max" min="0" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    </div>
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button onclick="app.closeModal()" style="
                        background: #95a5a6;
                        color: white;
                        border: none;
                        padding: 12px 25px;
                        border-radius: 25px;
                        cursor: pointer;
                        font-size: 1em;
                    ">Cancel</button>
                    <button onclick="app.performAdvancedSearch()" style="
                        background: linear-gradient(135deg, #3498db, #2980b9);
                        color: white;
                        border: none;
                        padding: 12px 25px;
                        border-radius: 25px;
                        cursor: pointer;
                        font-size: 1em;
                    ">🔍 Search</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
    }

    async performAdvancedSearch() {
        try {
            const searchParams = {
                fileName: document.getElementById('adv-file-name').value,
                fileType: document.getElementById('adv-file-type').value,
                folderId: document.getElementById('adv-folder').value || null,
                tags: document.getElementById('adv-tags').value,
                description: document.getElementById('adv-description').value,
                dateFrom: document.getElementById('adv-date-from').value,
                dateTo: document.getElementById('adv-date-to').value,
                sizeMin: document.getElementById('adv-size-min').value ? parseInt(document.getElementById('adv-size-min').value) * 1024 : null,
                sizeMax: document.getElementById('adv-size-max').value ? parseInt(document.getElementById('adv-size-max').value) * 1024 : null,
                limit: 100
            };

            // Check if at least one search parameter is provided
            const hasSearchParams = Object.values(searchParams).some(value => value && value !== '');
            if (!hasSearchParams) {
                this.showNotification('Please enter at least one search criteria', 'error');
                return;
            }

            this.closeModal();

            const results = await window.electronAPI.advancedSearch(searchParams);

            // Create a search query description for display
            const queryParts = [];
            if (searchParams.fileName) queryParts.push(`name: "${searchParams.fileName}"`);
            if (searchParams.fileType) queryParts.push(`type: ${searchParams.fileType}`);
            if (searchParams.tags) queryParts.push(`tags: "${searchParams.tags}"`);
            if (searchParams.folderId) {
                const folder = this.folders.find(f => f.id == searchParams.folderId);
                if (folder) queryParts.push(`folder: "${folder.name}"`);
            }

            const queryDescription = queryParts.length > 0 ? queryParts.join(', ') : 'Advanced search';

            this.displaySearchResults(results, queryDescription);

        } catch (error) {
            console.error('Error performing advanced search:', error);
            this.showError(error, 'Advanced search');
        }
    }

    initializeSearchInput() {
        // Wait a bit for DOM to be ready
        setTimeout(() => {
            try {
                const searchInput = document.getElementById('search-input');
                const searchBtn = document.getElementById('search-btn');

                if (!searchInput) {
                    console.error('Search input not found');
                    return;
                }

                console.log('Initializing search input...');

                // Clear any existing attributes that might interfere
                searchInput.removeAttribute('disabled');
                searchInput.removeAttribute('readonly');
                searchInput.style.pointerEvents = 'auto';
                searchInput.tabIndex = 0;

                // Simple event listeners
                searchInput.addEventListener('input', (e) => {
                    console.log('Search input changed:', e.target.value);
                    clearTimeout(this.searchTimeout);
                    this.searchTimeout = setTimeout(() => {
                        this.handleSearch(e.target.value);
                    }, 500);
                });

                searchInput.addEventListener('keypress', (e) => {
                    console.log('Key pressed:', e.key);
                    if (e.key === 'Enter') {
                        clearTimeout(this.searchTimeout);
                        this.handleSearch(e.target.value);
                    }
                });

                searchInput.addEventListener('focus', () => {
                    console.log('Search input focused');
                });

                if (searchBtn) {
                    searchBtn.addEventListener('click', () => {
                        const query = searchInput.value;
                        console.log('Search button clicked, query:', query);
                        this.handleSearch(query);
                    });
                }

                // Test the input
                console.log('Search input element:', searchInput);
                console.log('Search input type:', searchInput.type);
                console.log('Search input disabled:', searchInput.disabled);
                console.log('Search input readonly:', searchInput.readOnly);

                console.log('✓ Search input initialized successfully');

            } catch (error) {
                console.error('Error initializing search input:', error);
            }
        }, 100);
    }

    showMoveToFolderModal(fileId, fileHint = null) {
        if (this.folders.length === 0) {
            this.showNotification('Create a folder first, then you can add files to it.', 'error');
            return;
        }

        const file = fileHint || this.files.find(f => f.id === fileId);
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; align-items: center;
            justify-content: center; z-index: 10000;
        `;

        const folderOptions = this.folders.map(folder => {
            const selected = file?.folderId === folder.id ? 'selected' : '';
            return `<option value="${folder.id}" ${selected}>${folder.name}</option>`;
        }).join('');

        modal.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 15px; width: 90%; max-width: 420px;">
                <h3 style="margin-top: 0;">Add to Folder</h3>
                <p style="color: #7f8c8d; margin-bottom: 15px;">Choose which folder should contain this file.</p>
                <select id="move-file-folder-select" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 1em;">
                    ${folderOptions}
                </select>
                <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
                    <button id="cancel-move-file" class="modal-btn cancel">Cancel</button>
                    <button id="confirm-move-file" class="modal-btn primary" data-file-id="${fileId}">Add to Folder</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#cancel-move-file').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        modal.querySelector('#confirm-move-file').addEventListener('click', async () => {
            const folderId = parseInt(document.getElementById('move-file-folder-select').value, 10);
            modal.remove();
            await this.moveFileToFolder(fileId, folderId);
        });
    }

    async moveFileToFolder(fileId, folderId) {
        try {
            const result = await window.electronAPI.moveFileToFolder(fileId, folderId);
            if (result.success) {
                const folder = this.folders.find(f => f.id === folderId);
                this.showNotification(
                    `File added to "${folder ? folder.name : 'folder'}" successfully!`,
                    'success'
                );
                this.loadFolders();
                this.refreshCurrentFileView();
            } else {
                this.showError(result.error || 'Unknown error', 'Move file');
            }
        } catch (error) {
            console.error('Error moving file to folder:', error);
            this.showError(error, 'Move file');
        }
    }

    promptImportTargetFolder() {
        if (this.currentFolder) {
            return Promise.resolve(this.currentFolder.id);
        }

        if (this.folders.length === 0) {
            return Promise.resolve(null);
        }

        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); display: flex; align-items: center;
                justify-content: center; z-index: 10000;
            `;

            const folderOptions = this.folders.map(folder =>
                `<option value="${folder.id}">${folder.name}</option>`
            ).join('');

            modal.innerHTML = `
                <div style="background: white; padding: 30px; border-radius: 15px; width: 90%; max-width: 460px;">
                    <h3 style="margin-top: 0;">Import Into Folder</h3>
                    <p style="color: #7f8c8d; margin-bottom: 15px;">Choose where imported files and documents should go.</p>
                    <select id="import-target-folder-select" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 1em; margin-bottom: 12px;">
                        <option value="new">Create a new folder from the import</option>
                        ${folderOptions}
                    </select>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="cancel-import-target" class="modal-btn cancel">Cancel</button>
                        <button id="confirm-import-target" class="modal-btn primary">Continue Import</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const finish = (value) => {
                modal.remove();
                resolve(value);
            };

            modal.querySelector('#cancel-import-target').addEventListener('click', () => finish(undefined));
            modal.addEventListener('click', (e) => {
                if (e.target === modal) finish(undefined);
            });
            modal.querySelector('#confirm-import-target').addEventListener('click', () => {
                const value = document.getElementById('import-target-folder-select').value;
                finish(value === 'new' ? null : parseInt(value, 10));
            });
        });
    }

    async handleDeleteFolder(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        const folderName = folder ? folder.name : 'this folder';
        if (!confirm(`Delete "${folderName}" and all files and documents inside it? This cannot be undone.`)) {
            return;
        }
        
        try {
            const result = await window.electronAPI.deleteFolder(folderId);
            
            if (result.success) {
                const deletedCount = result.deletedFiles || 0;
                this.showNotification(
                    `Folder deleted along with ${deletedCount} file(s).`,
                    'success'
                );
                this.loadFolders();
                if (this.currentFolder && this.currentFolder.id === folderId) {
                    this.showAllFiles();
                } else {
                    this.refreshCurrentFileView();
                }
            } else {
                this.showError(result.error, 'Delete folder');
            }
        } catch (error) {
            console.error('Error deleting folder:', error);
            this.showError(error, 'Delete folder');
        }
    }

    closeModal() {
        const modal = document.querySelector('div[style*="position: fixed"]');
        if (modal) {
            modal.remove();
        }
    }

    showLoadingState() {
        const fileList = document.getElementById('file-list');
        fileList.innerHTML = '<div class="loading">Loading files...</div>';
    }

    async checkAuthentication() {
        try {
            let isAuthenticated = await window.electronAPI.checkAuth();

            if (!isAuthenticated) {
                const savedToken = localStorage.getItem(SESSION_STORAGE_KEY);
                if (savedToken) {
                    const restored = await window.electronAPI.restoreSession(savedToken);
                    if (restored.success) {
                        isAuthenticated = true;
                        localStorage.setItem(SESSION_STORAGE_KEY, restored.user.sessionToken);
                    } else {
                        localStorage.removeItem(SESSION_STORAGE_KEY);
                    }
                }
            }

            if (!isAuthenticated) {
                window.location.href = 'login.html';
                return;
            }

            this.currentUser = await window.electronAPI.getCurrentUser();
            if (this.currentUser?.sessionToken) {
                localStorage.setItem(SESSION_STORAGE_KEY, this.currentUser.sessionToken);
            }
            this.updateUserInfo();
            applyAllSettings();
        } catch (error) {
            console.error('Error checking authentication:', error);
            window.location.href = 'login.html';
        }
    }

    setupMoreNavigation() {
        document.getElementById('nav-more-btn').addEventListener('click', () => {
            this.showMoreView('settings');
        });

        document.getElementById('nav-home-btn').addEventListener('click', () => {
            this.showHomeView();
        });

        // Admin panel button
        const adminNavBtn = document.getElementById('nav-admin-btn');
        if (adminNavBtn) {
            adminNavBtn.addEventListener('click', () => {
                this.showMoreView('admin');
            });
        }

        document.getElementById('more-back-home-btn').addEventListener('click', () => {
            this.showHomeView();
        });

        document.querySelectorAll('.more-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchMoreTab(tab.dataset.moreTab);
            });
        });
    }

    setMoreButtonActive(active) {
        const moreBtn = document.getElementById('nav-more-btn');
        if (moreBtn) {
            moreBtn.classList.toggle('active', active);
        }
    }

    showHomeView() {
        this.currentView = 'home';
        document.getElementById('app-main-views').classList.remove('view-hidden');
        document.getElementById('more-section').classList.add('view-hidden');
        this.setMoreButtonActive(false);
    }

    showMoreView(tabName = 'settings') {
        this.currentView = 'more';
        document.getElementById('app-main-views').classList.add('view-hidden');
        document.getElementById('more-section').classList.remove('view-hidden');
        this.setMoreButtonActive(true);
        this.switchMoreTab(tabName);
    }

    switchMoreTab(tabName) {
        this.currentMoreTab = tabName;

        document.querySelectorAll('.more-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.moreTab === tabName);
        });

        document.querySelectorAll('.more-panel').forEach(panel => {
            panel.classList.remove('active');
        });

        const panel = document.getElementById(`more-${tabName}-panel`);
        if (panel) {
            panel.classList.add('active');
        }

        if (tabName === 'settings') {
            this.loadSettingsPanel();
        } else if (tabName === 'profile') {
            this.loadProfilePanel();
        } else if (tabName === 'session') {
            this.loadSessionPanel();
        } else if (tabName === 'admin') {
            this.loadAdminPanel();
        }
    }

    setupSettingsListeners() {
        document.getElementById('save-settings-btn').addEventListener('click', () => {
            this.saveSettingsFromForm();
        });

        document.getElementById('setting-theme').addEventListener('change', () => {
            applyTheme(document.getElementById('setting-theme').value);
        });

        document.getElementById('setting-language').addEventListener('change', () => {
            const language = document.getElementById('setting-language').value;
            saveSettings({ language });
            applyLanguage(language);
        });

        document.getElementById('setting-auto-backup').addEventListener('change', (e) => {
            saveSettings({ autoBackup: e.target.checked });
        });

        document.getElementById('export-backup-btn').addEventListener('click', () => {
            this.handleExportBackup();
        });

        document.getElementById('import-backup-btn').addEventListener('click', () => {
            this.handleImportBackup();
        });

        document.getElementById('goto-profile-btn').addEventListener('click', () => {
            this.switchMoreTab('profile');
        });

        document.getElementById('goto-password-btn').addEventListener('click', () => {
            this.switchMoreTab('password');
        });

        document.getElementById('goto-session-btn').addEventListener('click', () => {
            this.switchMoreTab('session');
        });

        // Admin panel listeners
        const refreshAdminBtn = document.getElementById('refresh-admin-btn');
        if (refreshAdminBtn) {
            refreshAdminBtn.addEventListener('click', () => {
                this.loadAdminPanel();
            });
        }

        const addSettingBtn = document.getElementById('add-setting-btn');
        if (addSettingBtn) {
            addSettingBtn.addEventListener('click', () => {
                this.handleAddSetting();
            });
        }

        // Storage & Subscription and Cloud Sync sections removed - local storage only
    }

    async loadSettingsPanel() {
        const settings = getSettings();

        document.getElementById('setting-theme').value = settings.theme || 'light';
        document.getElementById('setting-language').value = settings.language || 'en';
        document.getElementById('setting-auto-backup').checked = Boolean(settings.autoBackup);

        const lastBackupEl = document.getElementById('last-backup-value');
        if (settings.lastBackupAt) {
            lastBackupEl.textContent = this.formatDateTime(settings.lastBackupAt);
            lastBackupEl.removeAttribute('data-i18n');
        } else {
            lastBackupEl.textContent = t('never');
            lastBackupEl.setAttribute('data-i18n', 'never');
        }

        applyTheme(settings.theme);
    }

    // Storage & Subscription functions removed - local storage only

    async loadAdminPanel() {
        await this.loadAdminStats();
        await this.loadAdminUsers();
        await this.loadAdminFiles();
        await this.loadAdminActivityLogs();
        await this.loadAdminSystemSettings();
        await this.loadAdminAdvancedStats();

        // Setup admin user creation event listeners after admin panel is loaded
        this.setupAdminUserCreation();
        this.setupAdminFileManagement();
    }

    setupAdminUserCreation() {
        const adminCreateUserBtn = document.getElementById('admin-create-user-btn');
        if (adminCreateUserBtn) {
            adminCreateUserBtn.onclick = () => {
                this.showCreateUserForm();
            };
        }

        const adminSaveUserBtn = document.getElementById('admin-save-user-btn');
        if (adminSaveUserBtn) {
            adminSaveUserBtn.onclick = () => {
                this.handleCreateUser();
            };
        }

        const adminCancelUserBtn = document.getElementById('admin-cancel-user-btn');
        if (adminCancelUserBtn) {
            adminCancelUserBtn.onclick = () => {
                this.hideCreateUserForm();
            };
        }
    }

    async loadAdminStats() {
        try {
            const result = await window.electronAPI.adminGetStats();
            if (result.success) {
                document.getElementById('stat-total-users').textContent = result.stats.totalUsers;
                document.getElementById('stat-active-users').textContent = result.stats.activeUsers;
                document.getElementById('stat-admin-users').textContent = result.stats.adminUsers;
                document.getElementById('stat-total-files').textContent = result.stats.totalFiles;
            } else {
                console.error('Failed to load admin stats:', result.error);
            }
        } catch (error) {
            console.error('Error loading admin stats:', error);
        }
    }

    async loadAdminUsers() {
        const tbody = document.getElementById('admin-users-table-body');
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading users...</td></tr>';

        try {
            const result = await window.electronAPI.adminGetUsers();
            if (result.success) {
                tbody.innerHTML = '';
                
                if (result.users.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No users found</td></tr>';
                    return;
                }

                // Populate user filter dropdown for file management
                const userFilter = document.getElementById('admin-file-user-filter');
                if (userFilter) {
                    const currentValue = userFilter.value;
                    userFilter.innerHTML = '<option value="">All Users</option>';
                    result.users.forEach(user => {
                        const option = document.createElement('option');
                        option.value = user.id;
                        option.textContent = user.username;
                        userFilter.appendChild(option);
                    });
                    userFilter.value = currentValue;
                }

                result.users.forEach(user => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${user.id}</td>
                        <td>${this.escapeHtml(user.username)}</td>
                        <td>${this.escapeHtml(user.email)}</td>
                        <td><span class="role-badge ${user.role}">${user.role === 'admin' ? 'Super Admin' : 'User'}</span></td>
                        <td><span class="status-badge ${user.is_active ? 'active' : 'inactive'}">${user.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td>${this.formatDateTime(user.created_at)}</td>
                        <td>
                            <div class="admin-actions">
                                ${user.role !== 'admin' ? `
                                    <button class="btn btn-small btn-secondary" onclick="app.handleMakeAdmin(${user.id})">Make Super Admin</button>
                                ` : ''}
                                ${user.is_active ? `
                                    <button class="btn btn-small btn-secondary" onclick="app.handleDeactivateUser(${user.id})">Deactivate</button>
                                ` : `
                                    <button class="btn btn-small btn-secondary" onclick="app.handleActivateUser(${user.id})">Activate</button>
                                `}
                                <button class="btn btn-small btn-danger" onclick="app.handleDeleteUser(${user.id})">Delete</button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(row);
                });

                lucide.createIcons();
            } else {
                tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Error: ${result.error}</td></tr>`;
            }
        } catch (error) {
            console.error('Error loading admin users:', error);
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Error loading users</td></tr>`;
        }
    }

    async loadAdminSubscriptionPlans() {
        const container = document.getElementById('admin-subscription-plans-container');
        container.innerHTML = '<div class="loading">Loading subscription plans...</div>';

        try {
            const result = await window.electronAPI.getSubscriptionPlans();
            if (result.success) {
                container.innerHTML = '';
                
                const plansGrid = document.createElement('div');
                plansGrid.style.display = 'grid';
                plansGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(250px, 1fr))';
                plansGrid.style.gap = '20px';

                result.plans.forEach(plan => {
                    const planCard = document.createElement('div');
                    planCard.style.background = 'var(--bg-secondary)';
                    planCard.style.padding = '20px';
                    planCard.style.borderRadius = '8px';
                    planCard.style.border = '1px solid var(--border-color)';
                    
                    planCard.innerHTML = `
                        <h4 style="margin-bottom: 10px; color: var(--text-primary);">${plan.name}</h4>
                        <div style="font-size: 24px; font-weight: bold; margin-bottom: 15px; color: var(--accent-color);">
                            $${plan.price}/month
                        </div>
                        <div style="margin-bottom: 15px; color: var(--text-secondary);">
                            <strong>Storage:</strong> ${this.formatFileSize(plan.storage)}
                        </div>
                        <ul style="list-style: none; padding: 0; margin: 0;">
                            ${plan.features.map(feature => `
                                <li style="padding: 5px 0; color: var(--text-secondary); border-bottom: 1px solid var(--border-color);">
                                    ✓ ${feature}
                                </li>
                            `).join('')}
                        </ul>
                    `;
                    plansGrid.appendChild(planCard);
                });

                container.appendChild(plansGrid);
            } else {
                container.innerHTML = `<div class="empty-state">Error: ${result.error}</div>`;
            }
        } catch (error) {
            console.error('Error loading subscription plans:', error);
            container.innerHTML = `<div class="empty-state">Error loading subscription plans</div>`;
        }
    }

    async loadAdminFiles(userId = null) {
        const tbody = document.getElementById('admin-files-table-body');
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading files...</td></tr>';

        try {
            const result = await window.electronAPI.adminGetAllFiles(userId);
            if (result.success) {
                tbody.innerHTML = '';
                
                if (result.files.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No files found</td></tr>';
                    return;
                }

                result.files.forEach(file => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${file.id}</td>
                        <td>${this.escapeHtml(file.name)}</td>
                        <td>${this.escapeHtml(file.username || 'Unknown')}</td>
                        <td>${this.formatFileSize(file.size)}</td>
                        <td>${this.escapeHtml(file.file_type || 'Unknown')}</td>
                        <td>${this.formatDateTime(file.upload_date)}</td>
                        <td>
                            <div class="admin-actions">
                                <button class="btn btn-small btn-danger" onclick="app.handleAdminDeleteFile(${file.id})">Delete</button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Error: ${result.error}</td></tr>`;
            }
        } catch (error) {
            console.error('Error loading admin files:', error);
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Error loading files</td></tr>`;
        }
    }

    setupAdminFileManagement() {
        const userFilter = document.getElementById('admin-file-user-filter');
        if (userFilter) {
            userFilter.onchange = () => {
                const userId = userFilter.value ? parseInt(userFilter.value) : null;
                this.loadAdminFiles(userId);
            };
        }

        const refreshBtn = document.getElementById('admin-refresh-files-btn');
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                const userFilter = document.getElementById('admin-file-user-filter');
                const userId = userFilter.value ? parseInt(userFilter.value) : null;
                this.loadAdminFiles(userId);
            };
        }
    }

    async handleAdminDeleteFile(fileId) {
        if (!confirm('Are you sure you want to delete this file? This action cannot be undone.')) {
            return;
        }

        try {
            const result = await window.electronAPI.adminDeleteFile(fileId);
            if (result.success) {
                this.showNotification('File deleted successfully', 'success');
                const userFilter = document.getElementById('admin-file-user-filter');
                const userId = userFilter.value ? parseInt(userFilter.value) : null;
                await this.loadAdminFiles(userId);
            } else {
                this.showNotification('Failed to delete file: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            this.showNotification('Error deleting file', 'error');
        }
    }

    async handleAdminChangeSubscription(userId, planId) {
        try {
            const result = await window.electronAPI.adminUpdateUserSubscription(userId, planId);
            if (result.success) {
                this.showNotification('User subscription updated', 'success');
                await this.loadAdminUsers();
            } else {
                this.showNotification('Failed to update subscription: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error updating user subscription:', error);
            this.showNotification('Error updating subscription', 'error');
        }
    }

    async handleMakeAdmin(userId) {
        if (!confirm('Are you sure you want to give this user Super Admin access?')) {
            return;
        }

        try {
            const result = await window.electronAPI.adminSetUserRole(userId, 'admin');
            if (result.success) {
                this.showNotification('User promoted to Super Admin', 'success');
                await this.loadAdminUsers();
                await this.loadAdminStats();
            } else {
                this.showNotification('Failed to promote user: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error making user admin:', error);
            this.showNotification('Error promoting user', 'error');
        }
    }

    async handleDeactivateUser(userId) {
        if (!confirm('Are you sure you want to deactivate this user? They will not be able to login.')) {
            return;
        }

        try {
            const result = await window.electronAPI.adminDeactivateUser(userId);
            if (result.success) {
                this.showNotification('User deactivated', 'success');
                await this.loadAdminUsers();
                await this.loadAdminStats();
            } else {
                this.showNotification('Failed to deactivate user: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error deactivating user:', error);
            this.showNotification('Error deactivating user', 'error');
        }
    }

    async handleActivateUser(userId) {
        try {
            const result = await window.electronAPI.adminActivateUser(userId);
            if (result.success) {
                this.showNotification('User activated', 'success');
                await this.loadAdminUsers();
                await this.loadAdminStats();
            } else {
                this.showNotification('Failed to activate user: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error activating user:', error);
            this.showNotification('Error activating user', 'error');
        }
    }

    async handleDeleteUser(userId) {
        if (!confirm('Are you sure you want to delete this user? This action cannot be undone and will delete all their files and data.')) {
            return;
        }

        try {
            const result = await window.electronAPI.adminDeleteUser(userId);
            if (result.success) {
                this.showNotification('User deleted successfully', 'success');
                await this.loadAdminUsers();
                await this.loadAdminStats();
            } else {
                this.showNotification('Failed to delete user: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            this.showNotification('Error deleting user', 'error');
        }
    }

    async loadAdminActivityLogs() {
        const tbody = document.getElementById('admin-activity-table-body');
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Loading activity logs...</td></tr>';

        try {
            const result = await window.electronAPI.adminGetActivityLogs(100, 0);
            if (result.success) {
                tbody.innerHTML = '';

                if (result.logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No activity logs found</td></tr>';
                    return;
                }

                result.logs.forEach(log => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${this.formatDateTime(log.created_at)}</td>
                        <td>${this.escapeHtml(log.username)}</td>
                        <td><span class="action-badge">${this.escapeHtml(log.action)}</span></td>
                        <td>${log.details ? this.escapeHtml(log.details) : '-'}</td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Error: ${result.error}</td></tr>`;
            }
        } catch (error) {
            console.error('Error loading activity logs:', error);
            tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Error loading activity logs</td></tr>`;
        }
    }

    async loadAdminSystemSettings() {
        const container = document.getElementById('admin-settings-list');
        container.innerHTML = '<div class="loading">Loading system settings...</div>';

        try {
            const result = await window.electronAPI.adminGetSystemSettings();
            if (result.success) {
                container.innerHTML = '';

                if (result.settings.length === 0) {
                    container.innerHTML = '<div class="empty-state">No system settings configured</div>';
                    return;
                }

                result.settings.forEach(setting => {
                    const item = document.createElement('div');
                    item.className = 'admin-setting-item';
                    item.innerHTML = `
                        <div class="admin-setting-info">
                            <div class="admin-setting-key">${this.escapeHtml(setting.key)}</div>
                            <div class="admin-setting-value">${this.escapeHtml(setting.value)}</div>
                            ${setting.description ? `<div class="admin-setting-description">${this.escapeHtml(setting.description)}</div>` : ''}
                        </div>
                        <div class="admin-setting-actions">
                            <button class="btn btn-small btn-danger" onclick="app.handleDeleteSetting('${setting.key}')">Delete</button>
                        </div>
                    `;
                    container.appendChild(item);
                });
            } else {
                container.innerHTML = `<div class="empty-state">Error: ${result.error}</div>`;
            }
        } catch (error) {
            console.error('Error loading system settings:', error);
            container.innerHTML = `<div class="empty-state">Error loading system settings</div>`;
        }
    }

    async handleAddSetting() {
        const key = document.getElementById('setting-key').value.trim();
        const value = document.getElementById('setting-value').value.trim();
        const description = document.getElementById('setting-description').value.trim();

        if (!key || !value) {
            this.showNotification('Key and value are required', 'error');
            return;
        }

        try {
            const result = await window.electronAPI.adminSetSystemSetting(key, value, description);
            if (result.success) {
                this.showNotification('Setting added successfully', 'success');
                document.getElementById('setting-key').value = '';
                document.getElementById('setting-value').value = '';
                document.getElementById('setting-description').value = '';
                await this.loadAdminSystemSettings();
            } else {
                this.showNotification('Failed to add setting: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error adding setting:', error);
            this.showNotification('Error adding setting', 'error');
        }
    }

    async handleDeleteSetting(key) {
        if (!confirm(`Are you sure you want to delete the setting "${key}"?`)) {
            return;
        }

        try {
            const result = await window.electronAPI.adminDeleteSystemSetting(key);
            if (result.success) {
                this.showNotification('Setting deleted successfully', 'success');
                await this.loadAdminSystemSettings();
            } else {
                this.showNotification('Failed to delete setting: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting setting:', error);
            this.showNotification('Error deleting setting', 'error');
        }
    }

    async loadAdminAdvancedStats() {
        const container = document.getElementById('admin-advanced-stats-container');
        container.innerHTML = '<div class="loading">Loading advanced statistics...</div>';

        try {
            const result = await window.electronAPI.adminGetAdvancedStats();
            if (result.success) {
                const stats = result.stats;
                container.innerHTML = '<div class="stats-grid"></div>';
                const grid = container.querySelector('.stats-grid');

                // Storage by user
                if (stats.storageByUser && stats.storageByUser.length > 0) {
                    const storageCard = document.createElement('div');
                    storageCard.className = 'stats-card';
                    storageCard.innerHTML = '<h4>Storage Usage by User</h4>';
                    stats.storageByUser.slice(0, 10).forEach(user => {
                        const row = document.createElement('div');
                        row.className = 'stats-row';
                        row.innerHTML = `
                            <span class="stats-label">${this.escapeHtml(user.username)}</span>
                            <span class="stats-value">${this.formatFileSize(user.total_size || 0)} (${user.file_count || 0} files)</span>
                        `;
                        storageCard.appendChild(row);
                    });
                    grid.appendChild(storageCard);
                }

                // File type distribution
                if (stats.fileTypeDistribution && stats.fileTypeDistribution.length > 0) {
                    const typeCard = document.createElement('div');
                    typeCard.className = 'stats-card';
                    typeCard.innerHTML = '<h4>File Type Distribution</h4>';
                    stats.fileTypeDistribution.forEach(type => {
                        const row = document.createElement('div');
                        row.className = 'stats-row';
                        row.innerHTML = `
                            <span class="stats-label">${this.escapeHtml(type.file_type || 'unknown')}</span>
                            <span class="stats-value">${type.count} files (${this.formatFileSize(type.total_size || 0)})</span>
                        `;
                        typeCard.appendChild(row);
                    });
                    grid.appendChild(typeCard);
                }

                // Recent activity
                if (stats.recentActivity && stats.recentActivity.length > 0) {
                    const activityCard = document.createElement('div');
                    activityCard.className = 'stats-card';
                    activityCard.innerHTML = '<h4>Recent Activity (7 days)</h4>';
                    stats.recentActivity.forEach(activity => {
                        const row = document.createElement('div');
                        row.className = 'stats-row';
                        row.innerHTML = `
                            <span class="stats-label">${this.escapeHtml(activity.action)}</span>
                            <span class="stats-value">${activity.count} times</span>
                        `;
                        activityCard.appendChild(row);
                    });
                    grid.appendChild(activityCard);
                }

                // Overall stats
                const overallCard = document.createElement('div');
                overallCard.className = 'stats-card';
                overallCard.innerHTML = '<h4>Overall Statistics</h4>';
                overallCard.innerHTML += `
                    <div class="stats-row">
                        <span class="stats-label">Total Storage Used</span>
                        <span class="stats-value">${this.formatFileSize(stats.totalStorage || 0)}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stats-label">Average File Size</span>
                        <span class="stats-value">${this.formatFileSize(stats.averageFileSize || 0)}</span>
                    </div>
                `;
                grid.appendChild(overallCard);

            } else {
                container.innerHTML = `<div class="empty-state">Error: ${result.error}</div>`;
            }
        } catch (error) {
            console.error('Error loading advanced stats:', error);
            container.innerHTML = `<div class="empty-state">Error loading advanced statistics</div>`;
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    async loadStorageInfo() {
        try {
            const result = await window.electronAPI.getUserStorageInfo();
            if (result.success) {
                const storageInfo = result.storageInfo;
                const progressFill = document.getElementById('storage-progress-fill');
                const usedText = document.getElementById('storage-used-text');
                const limitText = document.getElementById('storage-limit-text');

                if (progressFill) {
                    progressFill.style.width = storageInfo.storagePercentage + '%';

                    // Add warning/danger classes based on usage
                    progressFill.classList.remove('warning', 'danger');
                    if (storageInfo.storagePercentage >= 90) {
                        progressFill.classList.add('danger');
                    } else if (storageInfo.storagePercentage >= 75) {
                        progressFill.classList.add('warning');
                    }
                }

                if (usedText) {
                    usedText.textContent = this.formatFileSize(storageInfo.storageUsed);
                }

                if (limitText) {
                    limitText.textContent = '/ ' + this.formatFileSize(storageInfo.storageLimit);
                }
            }
        } catch (error) {
            console.error('Error loading storage info:', error);
        }
    }

    saveSettingsFromForm() {
        const theme = document.getElementById('setting-theme').value;
        const language = document.getElementById('setting-language').value;
        const autoBackup = document.getElementById('setting-auto-backup').checked;

        saveSettings({ theme, language, autoBackup });
        applyAllSettings();
        this.showNotification(t('settingsSaved'), 'success');
    }

    async handleExportBackup() {
        try {
            const result = await window.electronAPI.exportBackup();
            if (result.success) {
                saveSettings({
                    lastBackupAt: new Date().toISOString(),
                    lastBackupPath: result.path
                });
                this.loadSettingsPanel();
                this.showNotification(t('backupExported'), 'success');
            } else if (result.error !== 'Cancelled') {
                this.showError(result.error || t('backupFailed'), 'Backup');
            }
        } catch (error) {
            console.error('Export backup error:', error);
            this.showNotification(t('backupFailed'), 'error');
        }
    }

    async handleImportBackup() {
        if (!confirm('Importing a backup will replace your current database and files. Continue?')) {
            return;
        }

        try {
            const result = await window.electronAPI.importBackup();
            if (result.success) {
                this.showNotification(t('backupImported'), 'success');
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } else if (result.error !== 'Cancelled') {
                this.showError(result.error || t('backupFailed'), 'Backup');
            }
        } catch (error) {
            console.error('Import backup error:', error);
            this.showNotification(t('backupFailed'), 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text ?? '';
        return div.innerHTML;
    }

    formatDateTime(value) {
        if (!value) {
            return '—';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleString();
    }

    async loadProfilePanel() {
        const container = document.getElementById('profile-content');
        container.innerHTML = '<div class="loading">Loading profile...</div>';

        try {
            const result = await window.electronAPI.getUserProfile();
            if (!result.success) {
                container.innerHTML = `<p style="color: #e74c3c;">${result.error || 'Failed to load profile'}</p>`;
                return;
            }

            const profile = result.profile;
            container.innerHTML = `
                <div class="profile-field">
                    <div class="profile-field-label">${t('username')}</div>
                    <div class="profile-field-value">${this.escapeHtml(profile.username)}</div>
                </div>
                <div class="profile-field">
                    <div class="profile-field-label">${t('email')}</div>
                    <div class="profile-field-value">${this.escapeHtml(profile.email)}</div>
                </div>
                <div class="profile-field">
                    <div class="profile-field-label">${t('accountCreated')}</div>
                    <div class="profile-field-value">${this.formatDateTime(profile.createdAt)}</div>
                </div>
                <div class="profile-field">
                    <div class="profile-field-label">${t('lastLogin')}</div>
                    <div class="profile-field-value">${this.formatDateTime(profile.lastLogin)}</div>
                </div>
                <div class="profile-field">
                    <div class="profile-field-label">${t('accountStatus')}</div>
                    <div class="profile-field-value">${profile.isActive ? t('active') : t('inactive')}</div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading profile:', error);
            container.innerHTML = '<p style="color: #e74c3c;">Error loading profile</p>';
        }
    }

    async loadSessionPanel() {
        const container = document.getElementById('session-content');
        container.innerHTML = '<div class="loading">Loading session...</div>';

        try {
            const result = await window.electronAPI.getSessionInfo();
            if (!result.success) {
                container.innerHTML = `<p style="color: #e74c3c;">${result.error || 'Failed to load session'}</p>`;
                return;
            }

            const session = result.session;
            const statusClass = session.isActive ? 'active' : 'expired';
            const statusText = session.isActive ? 'Active' : 'Expired';

            container.innerHTML = `
                <div class="profile-grid">
                    <div class="profile-field">
                        <div class="profile-field-label">${t('signedInAs')}</div>
                        <div class="profile-field-value">${this.escapeHtml(session.username)}</div>
                    </div>
                    <div class="profile-field">
                        <div class="profile-field-label">${t('email')}</div>
                        <div class="profile-field-value">${this.escapeHtml(session.email)}</div>
                    </div>
                    <div class="profile-field">
                        <div class="profile-field-label">${t('sessionStatus')}</div>
                        <div class="profile-field-value">
                            <span class="session-status ${statusClass}">${statusText}</span>
                        </div>
                    </div>
                    <div class="profile-field">
                        <div class="profile-field-label">${t('sessionStarted')}</div>
                        <div class="profile-field-value">${this.formatDateTime(session.createdAt)}</div>
                    </div>
                    <div class="profile-field">
                        <div class="profile-field-label">${t('sessionExpires')}</div>
                        <div class="profile-field-value">${this.formatDateTime(session.expiresAt)}</div>
                    </div>
                </div>
            `;

            if (!session.isActive) {
                this.showNotification('Your session has expired. Please log in again.', 'error');
                // Don't auto-logout, just show the message
            }
        } catch (error) {
            console.error('Error loading session:', error);
            container.innerHTML = '<p style="color: #e74c3c;">Error loading session</p>';
        }
    }

    async handleChangePassword() {
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-new-password').value;
        const submitBtn = document.getElementById('change-password-btn');

        if (newPassword.length < 8) {
            this.showNotification('New password must be at least 8 characters.', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showNotification('New passwords do not match.', 'error');
            return;
        }

        submitBtn.disabled = true;

        try {
            const result = await window.electronAPI.changePassword(currentPassword, newPassword);

            if (result.success) {
                document.getElementById('change-password-form').reset();
                this.showNotification('Password updated successfully!', 'success');
            } else {
                this.showNotification(result.error || 'Failed to change password', 'error');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            this.showNotification('Error changing password', 'error');
        } finally {
            submitBtn.disabled = false;
        }
    }

    async handleLogoutOtherSessions() {
        if (!confirm('End all other active sessions on other devices?')) {
            return;
        }

        try {
            const result = await window.electronAPI.logoutOtherSessions();
            if (result.success) {
                this.showNotification('Other sessions ended. This device remains signed in.', 'success');
                this.loadSessionPanel();
            } else {
                this.showNotification(result.error || 'Failed to end other sessions', 'error');
            }
        } catch (error) {
            console.error('Error ending other sessions:', error);
            this.showNotification('Error ending other sessions', 'error');
        }
    }

    updateUserInfo() {
        if (this.currentUser) {
            document.getElementById('user-info').style.display = 'flex';
            document.getElementById('username').textContent = this.currentUser.username;
            document.getElementById('user-email').textContent = this.currentUser.email;
        }
    }

    showCreateUserForm() {
        document.getElementById('admin-create-user-form').style.display = 'block';
        document.getElementById('admin-create-user-btn').style.display = 'none';
    }

    hideCreateUserForm() {
        document.getElementById('admin-create-user-form').style.display = 'none';
        document.getElementById('admin-create-user-btn').style.display = 'inline-flex';
        // Clear form fields
        document.getElementById('new-username').value = '';
        document.getElementById('new-email').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('new-role').value = 'user';
    }

    async handleCreateUser() {
        const usernameInput = document.getElementById('new-username');
        const emailInput = document.getElementById('new-email');
        const passwordInput = document.getElementById('new-password');
        const roleInput = document.getElementById('new-role');

        if (!usernameInput || !emailInput || !passwordInput || !roleInput) {
            console.error('Form elements not found');
            this.showNotification('Form elements not found', 'error');
            return;
        }

        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const role = roleInput.value;

        console.log('Form values:', { username, email, password: password ? '***' : '', role });

        if (!username || !email || !password) {
            this.showNotification('Please fill in all fields', 'error');
            return;
        }

        if (password.length < 6) {
            this.showNotification('Password must be at least 6 characters', 'error');
            return;
        }

        try {
            const result = await window.electronAPI.adminCreateUser({
                username,
                email,
                password,
                role
            });

            if (result.success) {
                this.showNotification('User created successfully!', 'success');
                this.hideCreateUserForm();
                // Reload users table
                this.loadAdminUsers();
            } else {
                this.showNotification(result.error || 'Failed to create user', 'error');
            }
        } catch (error) {
            console.error('Error creating user:', error);
            this.showNotification('Error creating user', 'error');
        }
    }

    async handleLogout() {
        try {
            const result = await window.electronAPI.logoutUser();
            if (result.success) {
                localStorage.removeItem(SESSION_STORAGE_KEY);
                this.showNotification('Logged out successfully', 'success');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1000);
            } else {
                this.showNotification('Logout failed: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error logging out:', error);
            this.showNotification('Logout failed', 'error');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 300px;
        `;
        
        // Set background color based on type
        const colors = {
            success: '#27ae60',
            error: '#e74c3c',
            info: '#3498db'
        };
        
        notification.style.backgroundColor = colors[type] || colors.info;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DocumentStorageApp();
});
