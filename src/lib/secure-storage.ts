import {
  encryptData,
  decryptData,
  generateEncryptionPassword,
} from "./crypto-utils";

/**
 * Secure storage wrapper for sensitive data
 */
export class SecureStorage {
  private static encryptionKey: string | null = null;

  /**
   * Initialize secure storage with encryption key
   */
  static async initialize(): Promise<void> {
    // Try to get existing key from storage
    const result = await chrome.storage.local.get("secure_storage_key");
    if (
      result.secure_storage_key &&
      typeof result.secure_storage_key === "string"
    ) {
      this.encryptionKey = result.secure_storage_key;
    } else {
      // Generate new key if none exists
      this.encryptionKey = generateEncryptionPassword();
      await chrome.storage.local.set({
        secure_storage_key: this.encryptionKey,
      });
    }
  }

  /**
   * Encrypt and store sensitive data
   */
  static async setEncrypted(key: string, data: any): Promise<void> {
    if (!this.encryptionKey) {
      await this.initialize();
    }

    try {
      const jsonData = JSON.stringify(data);
      const encrypted = await encryptData(jsonData, this.encryptionKey!);
      await chrome.storage.local.set({ [`secure_${key}`]: encrypted });
    } catch (error) {
      console.error("Failed to encrypt and store data:", error);
      throw error;
    }
  }

  /**
   * Retrieve and decrypt sensitive data
   */
  static async getEncrypted<T>(
    key: string,
    defaultValue?: T,
  ): Promise<T | null> {
    if (!this.encryptionKey) {
      await this.initialize();
    }

    try {
      const result = await chrome.storage.local.get(`secure_${key}`);
      if (!result[`secure_${key}`]) {
        return defaultValue || null;
      }

      const decrypted = await decryptData(
        result[`secure_${key}`] as string,
        this.encryptionKey!,
      );
      return JSON.parse(decrypted);
    } catch (error) {
      console.error("Failed to decrypt and retrieve data:", error);
      return defaultValue || null;
    }
  }

  /**
   * Remove encrypted data
   */
  static async removeEncrypted(key: string): Promise<void> {
    await chrome.storage.local.remove(`secure_${key}`);
  }

  /**
   * Clear all encrypted data
   */
  static async clearAllEncrypted(): Promise<void> {
    const allData = await chrome.storage.local.get();
    const encryptedKeys = Object.keys(allData).filter((key) =>
      key.startsWith("secure_"),
    );
    await chrome.storage.local.remove(encryptedKeys);
  }

  /**
   * Get all encrypted keys
   */
  static async getEncryptedKeys(): Promise<string[]> {
    const allData = await chrome.storage.local.get();
    return Object.keys(allData)
      .filter((key) => key.startsWith("secure_"))
      .map((key) => key.replace("secure_", ""));
  }
}
