import Dexie, { type Table } from 'dexie';
import type { UserScript, GMValue, UserPermission, SyncItem } from './types';

// Script statistics for tracking usage
export interface ScriptStats {
  scriptId: string;
  runCount: number;
  lastRun: number;
  totalErrors: number;
}

export class AnotherMonkeyDB extends Dexie {
  // 'scripts' is a table of UserScript.
  scripts!: Table<UserScript, string>; // The string is for the 'id' property.
  
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
    super('anothermonkey_db');
    this.version(2).stores({
      // The 'id' property is the primary key.
      // 'enabled' is an index for quick lookups of enabled scripts.
      scripts: 'id, enabled',
      
      // Dexie syntax for compound primary key is &[key1+key2]
      values: '&[scriptId+key]',

      // permissions table with compound primary key [scriptId, domain]
      permissions: '&[scriptId+domain]',

      // syncItems table with simple primary key
      syncItems: 'id, scriptId',
    });

    // Version 3: Add script statistics table
    this.version(3).stores({
      scripts: 'id, enabled',
      values: '&[scriptId+key]',
      permissions: '&[scriptId+domain]',
      syncItems: 'id, scriptId',
      scriptStats: 'scriptId',
    });
  }
}

// Export a singleton instance of the database
export const db = new AnotherMonkeyDB();