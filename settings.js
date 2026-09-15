// Settings management for Document Storage App

const SettingsManager = {
  currentTheme: 'light',
  currentLanguage: 'en',
  autoBackup: false,
  lastBackup: null,
  cloudSync: false,

  // Initialize settings from localStorage
  init() {
    const savedTheme = localStorage.getItem('docstore_theme');
    const savedLanguage = localStorage.getItem('docstore_language');
    const savedAutoBackup = localStorage.getItem('docstore_auto_backup');
    const savedLastBackup = localStorage.getItem('docstore_last_backup');
    const savedCloudSync = localStorage.getItem('docstore_cloud_sync');

    if (savedTheme) this.currentTheme = savedTheme;
    if (savedLanguage) this.currentLanguage = savedLanguage;
    if (savedAutoBackup) this.autoBackup = savedAutoBackup === 'true';
    if (savedLastBackup) this.lastBackup = savedLastBackup;
    if (savedCloudSync) this.cloudSync = savedCloudSync === 'true';

    this.applyTheme();
  },

  // Apply theme to document
  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  },

  // Save settings
  save() {
    localStorage.setItem('docstore_theme', this.currentTheme);
    localStorage.setItem('docstore_language', this.currentLanguage);
    localStorage.setItem('docstore_auto_backup', this.autoBackup);
    localStorage.setItem('docstore_cloud_sync', this.cloudSync);
    if (this.lastBackup) {
      localStorage.setItem('docstore_last_backup', this.lastBackup);
    }
  },

  // Set theme
  setTheme(theme) {
    this.currentTheme = theme;
    this.applyTheme();
  },

  // Set language
  setLanguage(language) {
    this.currentLanguage = language;
  },

  // Set auto backup
  setAutoBackup(enabled) {
    this.autoBackup = enabled;
  },

  // Update last backup time
  updateLastBackup() {
    this.lastBackup = new Date().toISOString();
  }
};

// Global functions for renderer.js compatibility
function initAppSettings() {
  SettingsManager.init();
}

function applyAllSettings() {
  SettingsManager.applyTheme();
}

function applyTheme(theme) {
  if (theme) {
    SettingsManager.setTheme(theme);
  } else {
    SettingsManager.applyTheme();
  }
}

function applyLanguage(language) {
  if (language) {
    SettingsManager.setLanguage(language);
  }
  // Note: Full i18n implementation would update all text elements here
}

function getSettings() {
  return {
    theme: SettingsManager.currentTheme,
    language: SettingsManager.currentLanguage,
    autoBackup: SettingsManager.autoBackup,
    lastBackupAt: SettingsManager.lastBackup,
    cloudSync: SettingsManager.cloudSync
  };
}

function saveSettings(settings) {
  if (settings.theme) SettingsManager.setTheme(settings.theme);
  if (settings.language) SettingsManager.setLanguage(settings.language);
  if (settings.autoBackup !== undefined) SettingsManager.setAutoBackup(settings.autoBackup);
  if (settings.cloudSync !== undefined) SettingsManager.cloudSync = settings.cloudSync;
  if (settings.lastBackupAt) SettingsManager.updateLastBackup();
  SettingsManager.save();
}

function setupSettingsListeners() {
  const saveBtn = document.getElementById('save-settings-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const theme = document.getElementById('setting-theme').value;
      const language = document.getElementById('setting-language').value;
      const autoBackup = document.getElementById('setting-auto-backup').checked;
      saveSettings({ theme, language, autoBackup });
    });
  }
}

// Internationalization (i18n) helper function
const translations = {
  en: {
    never: 'Never',
    settingsSaved: 'Settings saved',
    backupExported: 'Backup exported',
    backupImported: 'Backup imported',
    backupFailed: 'Backup failed',
    username: 'Username',
    email: 'Email',
    accountCreated: 'Account Created',
    lastLogin: 'Last Login',
    accountStatus: 'Account Status',
    active: 'Active',
    inactive: 'Inactive',
    signedInAs: 'Signed in as',
    sessionStatus: 'Session Status',
    sessionStarted: 'Session Started',
    sessionExpires: 'Session Expires'
  },
  es: {
    never: 'Nunca',
    settingsSaved: 'Configuración guardada',
    backupExported: 'Copia de seguridad exportada',
    backupImported: 'Copia de seguridad importada',
    backupFailed: 'Error de copia de seguridad',
    username: 'Nombre de usuario',
    email: 'Correo electrónico',
    accountCreated: 'Cuenta creada',
    lastLogin: 'Último inicio de sesión',
    accountStatus: 'Estado de la cuenta',
    active: 'Activo',
    inactive: 'Inactivo',
    signedInAs: 'Sesión iniciada como',
    sessionStatus: 'Estado de la sesión',
    sessionStarted: 'Sesión iniciada',
    sessionExpires: 'Sesión expira'
  },
  fr: {
    never: 'Jamais',
    settingsSaved: 'Paramètres enregistrés',
    backupExported: 'Sauvegarde exportée',
    backupImported: 'Sauvegarde importée',
    backupFailed: 'Échec de la sauvegarde',
    username: 'Nom d\'utilisateur',
    email: 'E-mail',
    accountCreated: 'Compte créé',
    lastLogin: 'Dernière connexion',
    accountStatus: 'Statut du compte',
    active: 'Actif',
    inactive: 'Inactif',
    signedInAs: 'Connecté en tant que',
    sessionStatus: 'Statut de la session',
    sessionStarted: 'Session démarrée',
    sessionExpires: 'Session expire'
  },
  de: {
    never: 'Nie',
    settingsSaved: 'Einstellungen gespeichert',
    backupExported: 'Sicherung exportiert',
    backupImported: 'Sicherung importiert',
    backupFailed: 'Sicherung fehlgeschlagen',
    username: 'Benutzername',
    email: 'E-Mail',
    accountCreated: 'Konto erstellt',
    lastLogin: 'Letzte Anmeldung',
    accountStatus: 'Kontostatus',
    active: 'Aktiv',
    inactive: 'Inaktiv',
    signedInAs: 'Angemeldet als',
    sessionStatus: 'Sitzungsstatus',
    sessionStarted: 'Sitzung gestartet',
    sessionExpires: 'Sitzung läuft ab'
  },
  pt: {
    never: 'Nunca',
    settingsSaved: 'Configurações salvas',
    backupExported: 'Backup exportado',
    backupImported: 'Backup importado',
    backupFailed: 'Falha no backup',
    username: 'Nome de usuário',
    email: 'E-mail',
    accountCreated: 'Conta criada',
    lastLogin: 'Último login',
    accountStatus: 'Status da conta',
    active: 'Ativo',
    inactive: 'Inativo',
    signedInAs: 'Conectado como',
    sessionStatus: 'Status da sessão',
    sessionStarted: 'Sessão iniciada',
    sessionExpires: 'Sessão expira'
  }
};

function t(key) {
  const lang = SettingsManager.currentLanguage || 'en';
  return translations[lang]?.[key] || translations.en[key] || key;
}

// Initialize settings when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SettingsManager.init());
} else {
  SettingsManager.init();
}
