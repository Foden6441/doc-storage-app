// Firebase configuration for cloud storage integration
// This file provides Firebase setup for potential cloud storage features

const { initializeApp, getApps, deleteApp } = require('firebase/app');
const { getStorage, ref, uploadBytes, deleteObject, getBytes } = require('firebase/storage');
const { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, getDoc, setDoc, updateDoc, query, where, orderBy } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile, EmailAuthProvider, reauthenticateWithCredential, updatePassword } = require('firebase/auth');

class FirebaseService {
    constructor() {
        this.app = null;
        this.storage = null;
        this.db = null;
        this.auth = null;
        this.isInitialized = false;
        this.currentUser = null;
        this.syncEnabled = false;
    }

    // Initialize Firebase with your configuration
    // Replace with your actual Firebase config
    initialize(config) {
        try {
            const existingApp = getApps().find(app => app.name === 'doc-storage-app');
            if (existingApp && (existingApp.options.projectId !== config.projectId || existingApp.options.apiKey !== config.apiKey)) {
                throw new Error('Firebase configuration changed. Restart the app to apply the new project.');
            }
            this.app = existingApp || initializeApp(config, 'doc-storage-app');
            this.storage = getStorage(this.app);
            this.db = getFirestore(this.app);
            this.auth = getAuth(this.app);
            this.isInitialized = true;
            console.log('Firebase initialized successfully');

            // Listen to auth state changes
            onAuthStateChanged(this.auth, (user) => {
                this.currentUser = user;
                if (user) {
                    console.log('User authenticated:', user.email);
                } else {
                    console.log('User signed out');
                }
            });
        } catch (error) {
            console.error('Error initializing Firebase:', error);
            throw error;
        }
    }

    // Enable/disable cloud sync
    setSyncEnabled(enabled) {
        this.syncEnabled = enabled;
    }

    // Check if sync is enabled
    isSyncEnabled() {
        return this.syncEnabled;
    }

    // Firebase Authentication - Register
    async registerUser(email, password, username) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized');
        }

        let registrationApp;
        try {
            // Use a temporary Firebase app so admin-created accounts do not
            // replace the Super Admin's active cloud session.
            registrationApp = initializeApp(this.app.options, `doc-storage-registration-${require('crypto').randomUUID()}`);
            const registrationAuth = getAuth(registrationApp);
            const userCredential = await createUserWithEmailAndPassword(registrationAuth, email, password);
            await updateProfile(userCredential.user, { displayName: username });
            return {
                success: true,
                user: {
                    uid: userCredential.user.uid,
                    email: userCredential.user.email,
                    displayName: username
                }
            };
        } catch (error) {
            console.error('Error registering user:', error);
            return { success: false, error: error.message };
        } finally {
            if (registrationApp) {
                try {
                    await deleteApp(registrationApp);
                } catch (error) {
                    console.error('Could not close temporary Firebase registration app:', error);
                }
            }
        }
    }

    // Firebase Authentication - Login
    async loginUser(email, password) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Error logging in user:', error);
            return { success: false, error: error.message };
        }
    }

    async sendPasswordReset(email) {
        if (!this.isInitialized) {
            return { success: false, error: 'Cloud password recovery is unavailable. Contact the app administrator.' };
        }
        try {
            await sendPasswordResetEmail(this.auth, email);
            return { success: true };
        } catch (error) {
            console.error('Error sending password reset email:', error);
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
                // Avoid revealing whether an account exists.
                return { success: true };
            }
            if (error.code === 'auth/network-request-failed') {
                return { success: false, error: 'Could not reach Firebase. Check your internet connection and try again.' };
            }
            return { success: false, error: 'Could not send the reset email. Check Firebase email/password settings and try again.' };
        }
    }

    // Firebase Authentication - Logout
    async logoutUser() {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            await signOut(this.auth);
            return { success: true };
        } catch (error) {
            console.error('Error logging out user:', error);
            return { success: false, error: error.message };
        }
    }

    async changePassword(currentPassword, newPassword) {
        const user = this.getCurrentUser();
        if (!user) return { success: false, error: 'Sign in to your cloud account first' };

        try {
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
            return { success: true };
        } catch (error) {
            console.error('Error changing cloud account password:', error);
            return { success: false, error: error.message };
        }
    }

    // Get current authenticated user
    getCurrentUser() {
        return this.auth?.currentUser || this.currentUser;
    }

    // Sync user data to Firestore
    async syncUserData(userId, userData) {
        if (!this.isInitialized || !this.syncEnabled) {
            return { success: false, error: 'Firebase not initialized or sync disabled' };
        }

        try {
            const userRef = doc(this.db, 'users', userId);
            await setDoc(userRef, {
                ...userData,
                lastSynced: new Date().toISOString()
            }, { merge: true });
            return { success: true };
        } catch (error) {
            console.error('Error syncing user data:', error);
            return { success: false, error: error.message };
        }
    }

    // Sync file to Firestore and Storage
    async syncFile(fileData, filePath) {
        if (!this.isInitialized || !this.syncEnabled) {
            return { success: false, error: 'Firebase not initialized or sync disabled' };
        }

        try {
            // Upload file to Storage
            const user = this.getCurrentUser();
            if (!user) throw new Error('Sign in to your cloud account before backing up files');
            const cloudId = fileData.cloudId || require('crypto').randomUUID();
            const uploadResult = await this.uploadFile(filePath, cloudId, fileData.name);

            if (!uploadResult.success) {
                return uploadResult;
            }

            // Save metadata to Firestore
            const firestoreData = {
                name: fileData.name,
                size: fileData.size,
                uploadDate: fileData.uploadDate,
                description: fileData.description || '',
                tags: Array.isArray(fileData.tags)
                    ? fileData.tags
                    : (typeof fileData.tags === 'string' ? fileData.tags.split(',').map(tag => tag.trim()).filter(Boolean) : []),
                fileType: fileData.fileType || this.getContentType(fileData.name),
                storagePath: uploadResult.fullPath,
                updatedAt: new Date().toISOString()
            };
            await setDoc(doc(this.db, 'users', user.uid, 'files', cloudId), firestoreData, { merge: true });
            return { success: true, cloudId };
        } catch (error) {
            console.error('Error syncing file:', error);
            return { success: false, error: error.message };
        }
    }

    // Download file from Firebase Storage
    async downloadFile(cloudId, localPath) {
        if (!this.isInitialized || !this.syncEnabled) {
            return { success: false, error: 'Firebase not initialized or sync disabled' };
        }

        try {
            const user = this.getCurrentUser();
            if (!user) throw new Error('Sign in to your cloud account before restoring files');
            const storageRef = ref(this.storage, `users/${user.uid}/files/${cloudId}`);
            const fileBytes = await getBytes(storageRef);
            
            const fs = require('fs');
            fs.writeFileSync(localPath, Buffer.from(fileBytes));

            return { success: true };
        } catch (error) {
            console.error('Error downloading file from Firebase:', error);
            return { success: false, error: error.message };
        }
    }

    // Get all synced files for a user
    async getUserFiles() {
        if (!this.isInitialized || !this.syncEnabled) {
            return { success: false, error: 'Firebase not initialized or sync disabled' };
        }

        try {
            const user = this.getCurrentUser();
            if (!user) throw new Error('Sign in to your cloud account before restoring files');
            const q = query(collection(this.db, 'users', user.uid, 'files'), orderBy('uploadDate', 'desc'));

            const querySnapshot = await getDocs(q);
            const files = [];

            querySnapshot.forEach((doc) => {
                files.push({
                    cloudId: doc.id,
                    ...doc.data()
                });
            });

            return { success: true, files };
        } catch (error) {
            console.error('Error getting user files from Firebase:', error);
            return { success: false, error: error.message };
        }
    }

    // Sync folder to Firestore
    async syncFolder(folderData) {
        if (!this.isInitialized || !this.syncEnabled) {
            return { success: false, error: 'Firebase not initialized or sync disabled' };
        }

        try {
            const folderRef = doc(this.db, 'folders', folderData.id.toString());
            await setDoc(folderRef, {
                ...folderData,
                lastSynced: new Date().toISOString()
            }, { merge: true });
            return { success: true };
        } catch (error) {
            console.error('Error syncing folder:', error);
            return { success: false, error: error.message };
        }
    }

    // Get all synced folders for a user
    async getUserFolders(userId) {
        if (!this.isInitialized || !this.syncEnabled) {
            return { success: false, error: 'Firebase not initialized or sync disabled' };
        }

        try {
            const q = query(
                collection(this.db, 'folders'),
                where('userId', '==', userId)
            );

            const querySnapshot = await getDocs(q);
            const folders = [];

            querySnapshot.forEach((doc) => {
                folders.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return { success: true, folders };
        } catch (error) {
            console.error('Error getting user folders from Firebase:', error);
            return { success: false, error: error.message };
        }
    }

    // Delete synced file
    async deleteSyncedFile(cloudId) {
        if (!this.isInitialized || !this.syncEnabled) {
            return { success: false, error: 'Firebase not initialized or sync disabled' };
        }

        try {
            const user = this.getCurrentUser();
            if (!user) throw new Error('Sign in to your cloud account before deleting backups');
            await deleteObject(ref(this.storage, `users/${user.uid}/files/${cloudId}`));
            await deleteDoc(doc(this.db, 'users', user.uid, 'files', cloudId));

            return { success: true };
        } catch (error) {
            console.error('Error deleting synced file:', error);
            return { success: false, error: error.message };
        }
    }

    // Delete synced folder
    async deleteSyncedFolder(folderId) {
        if (!this.isInitialized || !this.syncEnabled) {
            return { success: false, error: 'Firebase not initialized or sync disabled' };
        }

        try {
            await deleteDoc(doc(this.db, 'folders', folderId));
            return { success: true };
        } catch (error) {
            console.error('Error deleting synced folder:', error);
            return { success: false, error: error.message };
        }
    }

    // Upload file to Firebase Storage
    async uploadFile(filePath, cloudId, displayName) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const fs = require('fs');
            const user = this.getCurrentUser();
            if (!user) throw new Error('Sign in to your cloud account before backing up files');
            const fileSize = fs.statSync(filePath).size;
            if (fileSize > 104857600) throw new Error('Cloud backup supports files up to 100 MB. The local file was kept.');
            const fileBuffer = fs.readFileSync(filePath);

            const storageRef = ref(this.storage, `users/${user.uid}/files/${cloudId}`);
            const snapshot = await uploadBytes(storageRef, fileBuffer, {
                metadata: {
                    contentType: this.getContentType(displayName),
                    customMetadata: { originalName: displayName }
                }
            });
            
            return {
                success: true,
                fileName: snapshot.metadata.name,
                size: snapshot.metadata.size,
                fullPath: snapshot.metadata.fullPath
            };
        } catch (error) {
            console.error('Error uploading file to Firebase:', error);
            if (error?.status_ === 404 || error?.customData?.serverResponse?.includes?.('Bucket not found')) {
                const bucket = this.app?.options?.storageBucket || '(not configured)';
                throw new Error(`Firebase Storage could not find bucket "${bucket}". Create the Storage bucket in Firebase Console and set storageBucket to the exact bucket name shown in Project settings, then restart the app.`);
            }
            if (error?.code === 'storage/unknown' && !error?.customData?.serverResponse) {
                throw new Error('Firebase Storage returned an empty error response. Check that the configured Storage bucket exists, then check your internet connection and DNS settings.');
            }
            throw error;
        }
    }

    // Save file metadata to Firestore
    async saveFileMetadata(fileData) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const docRef = await addDoc(collection(this.db, 'files'), {
                name: fileData.name,
                originalPath: fileData.originalPath,
                storedPath: fileData.storedPath,
                downloadURL: fileData.downloadURL,
                size: fileData.size,
                uploadDate: fileData.uploadDate,
                description: fileData.description || '',
                tags: fileData.tags || [],
                fileType: fileData.fileType,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            return docRef.id;
        } catch (error) {
            console.error('Error saving file metadata to Firestore:', error);
            throw error;
        }
    }

    // Get all files from Firestore
    async getAllFiles() {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const querySnapshot = await getDocs(collection(this.db, 'files'));
            const files = [];
            
            querySnapshot.forEach((doc) => {
                files.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return files.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
        } catch (error) {
            console.error('Error getting files from Firestore:', error);
            throw error;
        }
    }

    // Delete file from Firebase Storage and Firestore
    async deleteFile(fileId, fileName) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            // Delete from Storage
            const storageRef = ref(this.storage, `documents/${fileName}`);
            await deleteObject(storageRef);

            // Delete from Firestore
            await deleteDoc(doc(this.db, 'files', fileId));

            return { success: true };
        } catch (error) {
            console.error('Error deleting file from Firebase:', error);
            throw error;
        }
    }

    // Get file by ID from Firestore
    async getFileById(fileId) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const docRef = doc(this.db, 'files', fileId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return {
                    id: docSnap.id,
                    ...docSnap.data()
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error getting file by ID from Firestore:', error);
            throw error;
        }
    }

    // Search files in Firestore
    async searchFiles(query) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const { query: firestoreQuery, where, orderBy } = require('firebase/firestore');
            
            const q = firestoreQuery(
                collection(this.db, 'files'),
                where('name', '>=', query),
                where('name', '<=', query + '\uf8ff'),
                orderBy('name')
            );

            const querySnapshot = await getDocs(q);
            const files = [];
            
            querySnapshot.forEach((doc) => {
                files.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return files;
        } catch (error) {
            console.error('Error searching files in Firestore:', error);
            throw error;
        }
    }

    // Get content type based on file extension
    getContentType(fileName) {
        const extension = fileName.split('.').pop().toLowerCase();
        
        const contentTypeMap = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'txt': 'text/plain',
            'rtf': 'application/rtf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'mp4': 'video/mp4',
            'avi': 'video/x-msvideo',
            'mov': 'video/quicktime',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'zip': 'application/zip',
            'rar': 'application/x-rar-compressed',
            '7z': 'application/x-7z-compressed'
        };
        
        return contentTypeMap[extension] || 'application/octet-stream';
    }

    // Check if Firebase is initialized
    isReady() {
        return this.isInitialized;
    }

    // Get Firebase app instance
    getApp() {
        return this.app;
    }

    // Get Firebase Storage instance
    getStorage() {
        return this.storage;
    }

    // Get Firestore instance
    getFirestore() {
        return this.db;
    }
}

// Example Firebase configuration
// Replace with your actual Firebase project configuration
const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id"
};

// Create and export Firebase service instance
const firebaseService = new FirebaseService();

// Initialize with config (uncomment and configure when ready to use Firebase)
// firebaseService.initialize(firebaseConfig);

module.exports = firebaseService; 
