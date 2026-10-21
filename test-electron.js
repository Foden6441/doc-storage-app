const electron = require('electron');
console.log('Electron:', typeof electron);
console.log('Keys:', Object.keys(electron));
console.log('Has app:', 'app' in electron);

// Try different ways to access app
try {
  console.log('electron.app:', typeof electron.app);
} catch(e) { console.log('electron.app error:', e.message); }

try {
  const { app } = require('electron');
  console.log('Destructured app:', typeof app);
} catch(e) { console.log('Destructured app error:', e.message); }