const path = require('path');
const { app } = require('electron');

let userDataPath;
let dbPath;
let uploadsDir;

function initAppPaths() {
  userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'documents.db');
  uploadsDir = path.join(userDataPath, 'uploads');
}

function getDbPath() {
  return dbPath;
}

function getUploadsDir() {
  return uploadsDir;
}

module.exports = {
  initAppPaths,
  getDbPath,
  getUploadsDir
};
