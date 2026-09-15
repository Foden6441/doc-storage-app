// Firebase configuration for cloud storage integration
// This file provides Firebase setup for potential cloud storage features

const { initializeApp } = require('firebase/app');
const { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, getBytes } = require('firebase/storage');
const { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, getDoc, setDoc, updateDoc, query, where, orderBy, onSnapshot } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } = require('firebase/auth');

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
            this.app = initializeApp(config);
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

        try {
            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
            await updateProfile(userCredential.user, { displayName: username });
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Error registering user:', error);
            return { success: false, error: error.message };
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

    // Get current authenticated user
    getCurrentUser() {
        return this.currentUser;
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
            const uploadResult = await this.uploadFile(filePath, fileData.name, {
                userId: fileData.userId,
                folderId: fileData.folderId
            });

            if (!uploadResult.success) {
                return uploadResult;
            }

            // Save metadata to Firestore
            const firestoreData = {
                ...fileData,
                downloadURL: uploadResult.downloadURL,
                firebasePath: uploadResult.fullPath,
                lastSynced: new Date().toISOString()
            };

            const docId = await this.saveFileMetadata(firestoreData);

            return { success: true, docId, downloadURL: uploadResult.downloadURL };
        } catch (error) {
            console.error('Error syncing file:', error);
            return { success: false, error: error.message };
        }
    }

    // Download file from Firebase Storage
    async downloadFile(firebasePath, localPath) {
        if (!this.isInitialized || !this.syncEnabled) {
            return { success: false, error: 'Firebase not initialized or sync disabled' };
        }

        try {
            const storageRef = ref(this.storage, firebasePath);
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
    async getUserFiles(userId) {
        if (!this.isInitialized || !this.syncEnabled) {
            return { success: false, error: 'Firebase not initialized or sync disabled' };
        }

        try {
            const q = query(
                collection(this.db, 'files'),
                where('userId', '==', userId),
                orderBy('uploadDate', 'desc')
            );

            const querySnapshot = await getDocs(q);
            const files = [];

            querySnapshot.forEach((doc) => {
                files.push({
                    id: doc.id,
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
    async deleteSyncedFile(fileId, firebasePath) {
        if (!this.isInitialized || !this.syncEnabled) {
            return { success: false, error: 'Firebase not initialized or sync disabled' };
        }

        try {
            // Delete from Storage
            if (firebasePath) {
                const storageRef = ref(this.storage, firebasePath);
                await deleteObject(storageRef);
            }

            // Delete from Firestore
            await deleteDoc(doc(this.db, 'files', fileId));

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
    async uploadFile(filePath, fileName, metadata = {}) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const fs = require('fs');
            const fileBuffer = fs.readFileSync(filePath);
            
            const storageRef = ref(this.storage, `documents/${fileName}`);
            const snapshot = await uploadBytes(storageRef, fileBuffer, {
                metadata: {
                    contentType: this.getContentType(fileName),
                    customMetadata: metadata
                }
            });

            const downloadURL = await getDownloadURL(snapshot.ref);
            
            return {
                success: true,
                downloadURL,
                fileName: snapshot.metadata.name,
                size: snapshot.metadata.size,
                fullPath: snapshot.metadata.fullPath
            };
        } catch (error) {
            console.error('Error uploading file to Firebase:', error);
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