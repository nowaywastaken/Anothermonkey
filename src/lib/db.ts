import Dexie, { type Table } from "dexie";
import type { UserScript, GMValue, UserPermission, SyncItem } from "./types";
import { SecureStorage } from "./secure-storage";

// Script statistics for tracking usage
export interface ScriptStats {
  scriptId: string;
  runCount: number;
  lastRun: number;
  totalErrors: number;
}

export class AnotherMonkeyDB extends Dexie {
  // 'scripts' is a table of UserScript.
  scripts!: Table<UserScript, string>; // The string is for 'id' property.

  // 'values' is a table of GMValue.
  // The compound key is [scriptId, key].
  values!: Table<GMValue, [string, string]>;

  // 'permissions' stores user-granted @connect permissions
  permissions!: Table<UserPermission, [string, string]>;

  // 'syncItems' tracks cloud sync state
  syncItems!: Table<SyncItem, string>;

  // 'scriptStats' tracks script usage statistics
  scriptStats!: Table<ScriptStats, string>;

  constructor() {
    super("anothermonkey_db");

    this.version(2).stores({
      // The 'id' property is primary key.
      // 'enabled' is an index for quick lookups of enabled scripts.
      scripts: "id, enabled",

      // Dexie syntax for compound primary key is &[key1+key2]
      values: "&[scriptId+key]",

      // permissions table with compound primary key [scriptId, domain]
      permissions: "&[scriptId+domain]",

      // syncItems table with simple primary key
      syncItems: "id, scriptId",
    });

    // Version 3: Add script statistics table
    this.version(3).stores({
      scripts: "id, enabled",
      values: "&[scriptId+key]",
      permissions: "&[scriptId+domain]",
      syncItems: "id, scriptId",
      scriptStats: "scriptId",
    });

    // Initialize secure storage after database setup
    this.initializeSecureStorage();
  }

  private async initializeSecureStorage() {
    try {
      await SecureStorage.initialize();
    } catch (error) {
      console.warn("Failed to initialize secure storage:", error);
    }
  }

  // Secure methods for sensitive data
  async secureSetScriptValue(
    scriptId: string,
    key: string,
    value: any,
  ): Promise<void> {
    const secureKey = `script_value_${scriptId}_${key}`;
    await SecureStorage.setEncrypted(secureKey, value);
  }

  async secureGetScriptValue<T>(
    scriptId: string,
    key: string,
    defaultValue?: T,
  ): Promise<T | null> {
    const secureKey = `script_value_${scriptId}_${key}`;
    return await SecureStorage.getEncrypted<T>(secureKey, defaultValue);
  }

  async secureDeleteScriptValue(scriptId: string, key: string): Promise<void> {
    const secureKey = `script_value_${scriptId}_${key}`;
    await SecureStorage.removeEncrypted(secureKey);
  }
}

// Export a singleton instance of database
export const db = new AnotherMonkeyDB();
