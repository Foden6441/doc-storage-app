# Document Storage App

A modern Electron-based desktop application for storing and managing your documents locally with a beautiful, intuitive interface.

## Features

- 🔐 **User Authentication**: Secure signup and login system
- 📁 **File Upload**: Drag & drop or click to upload files
- 🗂️ **File Management**: View, open, and delete stored files
- 📊 **Statistics**: Track total files and storage usage
- 🎨 **Modern UI**: Beautiful gradient design with smooth animations
- 🔍 **File Organization**: Automatic file type detection and categorization
- 💾 **Local Storage**: Files stored securely on your local machine
- 🔐 **Encrypted Files**: Uploaded files are encrypted at rest with AES-256-GCM; the encryption key is protected by the operating system
- 🗄️ **SQLite Database**: Reliable metadata storage
- 👤 **User Isolation**: Each user has their own private file storage

## Supported File Types

- **Documents**: PDF, DOC, DOCX, TXT, RTF
- **Images**: JPG, JPEG, PNG, GIF, BMP
- **Videos**: MP4, AVI, MOV
- **Audio**: MP3, WAV
- **Archives**: ZIP, RAR, 7Z
- **All Files**: Any file type supported

## Installation

1. Make sure you have Node.js installed (version 14 or higher)
2. Clone or download this project
3. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Development Mode
```bash
npm run dev
```
This will start the app with developer tools open.

### Production Mode
```bash
npm start
```

## How to Use

1. **Authentication**:
   - Start the app and you'll be redirected to the login page
   - Create a new account using the signup form
   - Login with your credentials to access your private storage

2. **Upload Files**:
   - Click the "Upload File" button to browse and select files
   - Or drag and drop files directly onto the upload area
   - Files are encrypted before they are saved in the `uploads/` directory

3. **View Files**:
   - All uploaded files are displayed in a grid layout
   - Each file shows its name, size, and upload date
   - Files are automatically categorized by type with appropriate icons

4. **Manage Files**:
   - Click "Open" to decrypt a temporary copy and open it with your system's default application
   - Click "Delete" to remove a file (with confirmation)
   - Use the "Refresh" button to reload the file list

5. **Monitor Usage**:
   - View total number of files and total storage size in the sidebar
   - Statistics update automatically when files are added or removed

6. **User Management**:
   - View your user information in the sidebar
   - Click "Logout" to sign out and return to login page

## Project Structure

```
doc-storage-app/
├── main.js          # Main Electron process
├── index.html       # Main application window
├── login.html       # Login page
├── signup.html      # Signup page
├── renderer.js      # Renderer process (UI logic)
├── database.js      # SQLite database operations
├── auth.js          # Authentication service
├── firebase.js      # Firebase integration (optional)
├── uploads/         # Directory for stored files
├── package.json     # Project configuration
└── README.md        # This file
```

## Database

The app uses SQLite (via `better-sqlite3`) to store file metadata. The database file (`documents.db`) is created automatically in the project root.

Uploaded files are encrypted with AES-256-GCM before storage. The app protects the encryption key using Electron's operating-system-backed `safeStorage`. Existing files in the app's uploads folder are encrypted when the app starts. Opening a file creates a temporary decrypted copy in the operating system temp directory, which is removed after 30 minutes; anyone who can access that temp directory during that time may be able to read it. Exported backups contain encrypted files and can only be restored where the same operating-system protected key is available. Keep the app data and backup together, and do not delete `file-encryption-key` from the app data folder.

### Database Schema

- **files**: Stores file metadata (name, path, size, upload date, etc.)
- **tags**: For future tag functionality
- **file_tags**: Junction table for file-tag relationships

## Firebase Integration

The app includes Firebase configuration for potential cloud storage features. To enable Firebase:

1. Create a Firebase project
2. Update the configuration in `firebase.js`
3. Uncomment the initialization line
4. Install Firebase dependencies: `npm install firebase`

## Development

### Adding New Features

- **File Search**: Implement search functionality in `renderer.js`
- **File Tags**: Extend the database schema and UI for tagging
- **File Preview**: Add preview capabilities for images and documents
- **Cloud Sync**: Integrate with Firebase for cloud storage

### Customization

- **Styling**: Modify CSS in `index.html`
- **File Types**: Add new file types in `database.js` and `renderer.js`
- **UI Layout**: Adjust the HTML structure in `index.html`

## Troubleshooting

### Common Issues

1. **App won't start**: Make sure all dependencies are installed with `npm install`
2. **Files not uploading**: Check that the `uploads/` directory exists and has write permissions
3. **Database errors**: Delete `documents.db` to reset the database (files will remain)

### Logs

Check the console output for error messages and debugging information.

## License

This project is open source and available under the ISC License.

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the application. 
