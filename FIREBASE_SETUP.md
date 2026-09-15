# Firebase Cloud Sync Setup Guide

This guide will help you set up Firebase cloud sync for the Document Storage App, allowing you to access your documents from any device even if your computer is lost or damaged.

## What is Firebase Cloud Sync?

Firebase Cloud Sync enables you to:
- **Backup your documents** to Google's secure cloud storage
- **Access files from any device** by logging into your Firebase account
- **Recover data** if your computer is lost, stolen, or damaged
- **Sync across multiple devices** seamlessly

## Prerequisites

- A Google account (free)
- Basic understanding of web configuration

## Step-by-Step Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter a project name (e.g., "DocumentStorageApp")
4. Accept the Firebase terms and click **"Continue"**
5. Disable Google Analytics (optional) and click **"Create project"**
6. Wait for project creation to complete

### 2. Enable Authentication

1. In your Firebase project, go to **"Build"** → **"Authentication"**
2. Click **"Get Started"**
3. Select the **"Sign-in method"** tab
4. Enable **"Email/Password"** provider
5. Click **"Save"**

### 3. Enable Firestore Database

1. Go to **"Build"** → **"Firestore Database"**
2. Click **"Create database"**
3. Select a location (choose one closest to you)
4. Choose **"Start in Test Mode"** (for development)
5. Click **"Enable"**

### 4. Enable Cloud Storage

1. Go to **"Build"** → **"Storage"**
2. Click **"Get Started"**
3. Accept the default rules (for development)
4. Click **"Done"**

### 5. Get Firebase Configuration

1. Click the **gear icon** (⚙️) next to **"Project Overview"**
2. Select **"Project settings"**
3. Scroll down to **"Your apps"** section
4. Click the **"Web"** icon (</>)
5. Enter an app name (e.g., "Document Storage App")
6. Click **"Register app"**
7. Copy the **firebaseConfig** object (it looks like this):

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 6. Configure the App

1. Open the Document Storage App
2. Click **"More Options"** in the sidebar
3. Go to **"Settings"** tab
4. Scroll down to **"Cloud Sync"** section
5. Check **"Enable Cloud Sync"**
6. Fill in the Firebase configuration fields:
   - **API Key**: Paste the `apiKey` value
   - **Project ID**: Paste the `projectId` value
   - **Auth Domain**: Paste the `authDomain` value
   - **Storage Bucket**: Paste the `storageBucket` value
   - **App ID**: Paste the `appId` value
7. Click **"Save Firebase Config"**

### 7. Create Firebase Account

1. After saving the config, you'll see login fields
2. Enter your email and password
3. Click **"Register"** to create a new Firebase account
4. Or click **"Login"** if you already have one
5. You'll see a success message when logged in

### 8. Sync Your Data

1. Once logged in, click **"Sync to Cloud"** button
2. Wait for the sync to complete (shows number of files synced)
3. Your documents are now backed up to Firebase!

## How to Restore Data on a New Device

1. Install the Document Storage App on your new device
2. Create a local account (this will be your local database)
3. Go to **Settings** → **Cloud Sync**
4. Enable Cloud Sync and enter your Firebase configuration
5. Login with your Firebase account
6. Click **"Sync from Cloud"** button
7. Your documents will be downloaded to the new device

## Important Notes

### Security
- Your Firebase credentials are stored locally on your device
- Never share your Firebase configuration or credentials
- Use a strong password for your Firebase account

### Storage Limits
- Firebase Free Tier:
  - **Storage**: 5 GB
  - **Database**: 50 GB/month
  - **Download**: 10 GB/month
- For larger storage needs, consider upgrading to a paid Firebase plan

### Best Practices
- **Sync regularly** after adding important documents
- **Test restore** on a test device to ensure your backup works
- **Keep local backups** as an additional safety measure
- **Monitor usage** in Firebase Console to avoid exceeding limits

## Troubleshooting

### "Firebase not initialized" error
- Check that all configuration fields are filled correctly
- Ensure your Firebase project has Authentication, Firestore, and Storage enabled
- Try restarting the app

### "Sync failed" error
- Check your internet connection
- Verify you're logged into Firebase
- Ensure you have enough Firebase storage quota
- Check Firebase Console for any service outages

### "Login failed" error
- Verify your email and password are correct
- Ensure Email/Password authentication is enabled in Firebase Console
- Try resetting your Firebase password if needed

### Files not syncing
- Check if sync is enabled in settings
- Verify you're logged into Firebase
- Ensure files are not too large (Firebase has file size limits)
- Check Firebase Storage rules in Console

## Firebase Security Rules (Advanced)

For production use, update your Firebase Security Rules in the Console:

**Firestore Rules:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /files/{fileId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    match /folders/{folderId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
    }
  }
}
```

**Storage Rules:**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /documents/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Support

If you encounter issues:
1. Check the Firebase Console for error logs
2. Review this guide's troubleshooting section
3. Ensure all Firebase services are enabled
4. Verify your configuration is correct

## Cost Considerations

Firebase offers a generous free tier suitable for personal use:
- **Free tier**: 5 GB storage, 50 GB/month database reads/writes
- **Paid plans**: Start at $25/month for Blaze plan with pay-as-you-go pricing

For most personal document storage needs, the free tier is sufficient.

---

**Last Updated**: September 2026
**Version**: 1.0
