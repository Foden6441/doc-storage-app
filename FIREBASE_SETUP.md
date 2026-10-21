# Firebase Cloud Sync Setup Guide

## Current cloud backup setup

New app accounts use Firebase Email/Password authentication. A successful file upload is stored locally first, then backed up to the signed-in user's private Cloud Storage path. Signing in on another computer restores files into that computer's local database and uploads folder. Cloud backup applies to files; folder organization is not restored yet. Files larger than 100 MB are blocked by the included Storage rules. Deleting a local file does not delete its cloud backup, so a later restore can bring it back.

Before using cloud accounts:

1. In Firebase Console, enable **Authentication → Email/Password**.
2. Create **Cloud Firestore** and **Cloud Storage** for the project.
3. Publish the rules in this repository: paste `firestore.rules` into Firestore's Rules tab and `storage.rules` into Storage's Rules tab. Do not leave the database or bucket in test mode or use public read/write rules.
4. Put your Firebase web app configuration in `DEFAULT_FIREBASE_CONFIG` in `main.js`, or configure it in the app if Firebase could not initialize. The current default points to `doc-storage-app-b2cb1`; replace it if that is not your project.
5. Alternatively, from a terminal with the Firebase CLI logged into your project, run `firebase deploy --only firestore:rules,storage` from this project directory.

New signups require Firebase to be reachable. Existing local-only accounts can still sign in on their original computer, but they do not have cross-computer backups until linked to a Firebase account. Always wait for the app to report that the backup completed before relying on a file being recoverable.

**Billing:** Cloud Storage for Firebase requires the pay-as-you-go Blaze plan, which links a billing account. Some usage may fall within no-cost quotas, but usage beyond them can incur charges. Check the [current Firebase pricing](https://firebase.google.com/pricing) and [Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) before enabling it. The app's 100 MB per-file rule is a safety cap, not a billing cap.

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
4. Choose **production mode**; the repository's `firestore.rules` file will define per-user access.
5. Click **"Enable"**

### 4. Enable Cloud Storage

1. Go to **"Build"** → **"Storage"**
2. Click **"Get Started"**
3. Create the bucket, then publish the repository's `storage.rules` file so each account can access only its own files.
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

1. Set `DEFAULT_FIREBASE_CONFIG` in `main.js` to the Firebase web app configuration:
   - **API Key**: Paste the `apiKey` value
   - **Project ID**: Paste the `projectId` value
   - **Auth Domain**: Paste the `authDomain` value
   - **Storage Bucket**: Paste the `storageBucket` value
   - **App ID**: Paste the `appId` value
2. Restart the app after changing the configuration.

### 7. Create Firebase Account

Create an account in the app with an email address and password. On other computers, sign in using that same email and password. Usernames are only available on computers whose local database already knows the username.

### 8. Sync Your Data

New uploads are backed up automatically when cloud sync is enabled. Use **Back Up Now** in Settings to back up existing local files; wait for the completion status.

## How to Restore Data on a New Device

1. Install the app and configure the same Firebase project.
2. Sign in from the app's login screen with the same email and password.
3. The app restores backed-up files after sign-in. You can also use **Restore from Cloud** in Settings.

## Important Notes

### Security
- Your Firebase credentials are stored locally on your device
- Never share your Firebase configuration or credentials
- Use a strong password for your Firebase account

### Storage Limits
- Cloud Storage requires the Blaze billing plan. Exact costs and any no-cost usage depend on the bucket region and current Google Cloud Storage pricing.
- Set a billing budget and monitor usage in Google Cloud Console.
- The app blocks individual cloud backups over 100 MB; this does not limit total storage or transfer costs.

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

Use the checked-in [firestore.rules](firestore.rules) and [storage.rules](storage.rules). The older broad `/documents/**` example is unsafe and is not compatible with this app's user-scoped paths.

## Support

If you encounter issues:
1. Check the Firebase Console for error logs
2. Review this guide's troubleshooting section
3. Ensure all Firebase services are enabled
4. Verify your configuration is correct

## Cost Considerations

Cloud Storage for Firebase requires the Blaze pay-as-you-go plan. Review the current [Firebase pricing](https://firebase.google.com/pricing) and configure a billing budget before enabling cloud backup. Cost depends on storage region, stored data, and downloads.

---

**Last Updated**: September 2026
**Version**: 1.0
