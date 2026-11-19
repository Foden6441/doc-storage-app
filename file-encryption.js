const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAGIC = Buffer.from('DSENC001');
const ALGORITHM = 'aes-256-gcm';

class FileEncryption {
  constructor(safeStorage, keyPath) {
    this.safeStorage = safeStorage;
    this.keyPath = keyPath;
    this.key = null;
  }

  initialize() {
    if (!this.safeStorage?.isEncryptionAvailable()) {
      throw new Error('Operating system encryption is unavailable. Files cannot be stored securely.');
    }
    if (fs.existsSync(this.keyPath)) {
      this.key = this.safeStorage.decryptString(fs.readFileSync(this.keyPath));
      this.key = Buffer.from(this.key, 'base64');
    } else {
      this.key = crypto.randomBytes(32);
      fs.mkdirSync(path.dirname(this.keyPath), { recursive: true });
      fs.writeFileSync(this.keyPath, this.safeStorage.encryptString(this.key.toString('base64')), { mode: 0o600 });
    }
    if (this.key.length !== 32) throw new Error('Stored file encryption key is invalid.');
  }

  isEncrypted(data) {
    return data.length >= MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC);
  }

  encryptBuffer(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
  }

  decryptBuffer(data) {
    if (!this.isEncrypted(data)) return data; // Legacy files remain readable during migration.
    const ivStart = MAGIC.length;
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, data.subarray(ivStart, ivStart + 12));
    decipher.setAuthTag(data.subarray(ivStart + 12, ivStart + 28));
    return Buffer.concat([decipher.update(data.subarray(ivStart + 28)), decipher.final()]);
  }

  encryptFile(sourcePath, destinationPath = sourcePath) {
    const data = fs.readFileSync(sourcePath);
    if (this.isEncrypted(data)) return;
    const encrypted = this.encryptBuffer(data);
    const temporaryPath = `${destinationPath}.encrypting`;
    const originalPath = `${destinationPath}.plaintext-backup`;
    fs.writeFileSync(temporaryPath, encrypted, { mode: 0o600 });
    if (sourcePath === destinationPath) {
      fs.renameSync(destinationPath, originalPath);
      try {
        fs.renameSync(temporaryPath, destinationPath);
        fs.unlinkSync(originalPath);
      } catch (error) {
        if (!fs.existsSync(destinationPath) && fs.existsSync(originalPath)) fs.renameSync(originalPath, destinationPath);
        throw error;
      }
    } else {
      fs.renameSync(temporaryPath, destinationPath);
    }
  }

  decryptToFile(encryptedPath, destinationPath) {
    fs.writeFileSync(destinationPath, this.decryptBuffer(fs.readFileSync(encryptedPath)), { mode: 0o600 });
  }
}

module.exports = FileEncryption;
