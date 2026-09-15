# 📦 Document Storage App - Deployment Guide

## 🚀 Quick Start - Build and Install

### **Option 1: Automated Build (Recommended)**
```bash
# Run the automated build script
node build-and-deploy.js
```

### **Option 2: Manual Build**
```bash
# 1. Install dependencies (if not already done)
npm install

# 2. Rebuild native modules for Electron
npx electron-rebuild

# 3. Build for Windows
npm run build-win

# 4. Find your installer in the 'dist' folder
```

## 📋 Step-by-Step Installation

### **1. Build the Application**
1. Open Command Prompt or PowerShell
2. Navigate to your app directory: `cd C:\Users\jumer\doc-storage-app`
3. Run: `node build-and-deploy.js`
4. Wait for the build to complete (may take 2-5 minutes)

### **2. Install the Application**
1. Go to the `dist` folder in your project directory
2. Find the `.exe` file (e.g., `Document Storage App Setup 1.0.0.exe`)
3. Double-click the installer
4. Follow the installation wizard:
   - Choose installation directory
   - Select desktop shortcut option
   - Select Start Menu shortcut option
5. Click "Install"

### **3. Launch the Application**
- **From Desktop**: Double-click the "Document Storage App" icon
- **From Start Menu**: Search for "Document Storage App"
- **From Installation Directory**: Navigate to installation folder and run the .exe

## 🎯 First Time Setup

### **1. Create Your Account**
1. Launch the app
2. Click "Sign Up" on the login screen
3. Enter your details:
   - Username
   - Email
   - Password
4. Click "Register"

### **2. Start Using the App**
1. **Upload Files**: Click "Upload File" or drag & drop
2. **Create Folders**: Click "Create Folder" to organize files
3. **Import Folders**: Click "Import Folder" to add entire folders from your device
4. **Search**: Use the search bar to find files and folders
5. **Manage**: Edit, delete, and organize your documents

## 🔧 Features Available

### **File Management**
- ✅ Upload individual files
- ✅ Import entire folders from device
- ✅ Organize files in custom folders
- ✅ Edit folder names, descriptions, and colors
- ✅ Delete files and folders

### **Search Functionality**
- ✅ Real-time search as you type
- ✅ Search files and folders
- ✅ Advanced search with filters
- ✅ Search by file type, date, size, tags

### **User Management**
- ✅ User registration and login
- ✅ Secure password storage
- ✅ Session management
- ✅ User-specific data isolation

## 📁 File Storage Location

Your files are stored locally in:
- **Database**: `documents.db` (in app installation directory)
- **Uploaded Files**: `uploads` folder (in app installation directory)

## 🔄 Updating the App

To update to a new version:
1. Build the new version using the same process
2. Run the new installer
3. It will update the existing installation
4. Your data will be preserved

## 🛠️ Troubleshooting

### **Build Issues**
- **Error: "better-sqlite3 module not found"**
  - Run: `npm rebuild better-sqlite3`
  - Then retry the build

- **Error: "electron-builder not found"**
  - Run: `npm install --save-dev electron-builder`
  - Then retry the build

### **Runtime Issues**
- **App won't start**
  - Check if Windows Defender is blocking the app
  - Run as administrator if needed

- **Database errors**
  - Delete `documents.db` to reset (you'll lose data)
  - Restart the app

### **Search not working**
- Clear browser cache if using web version
- Restart the application
- Check console for error messages

## 📞 Support

If you encounter issues:
1. Check the console output for error messages
2. Verify all files are present in the installation directory
3. Try running as administrator
4. Reinstall if necessary

## 🎉 Enjoy Your Document Storage App!

Your app is now ready to use! You can:
- Store and organize all your documents
- Search through your files quickly
- Import entire folders from your device
- Keep everything secure with user authentication

Happy organizing! 📁✨
