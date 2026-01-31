import { db } from "./db"
import type { UserScript } from "./types"
import { encryptData, decryptData, isEncrypted } from "./crypto-utils"

const BACKUP_FILENAME = "anothermonkey_backup.json"
const ENCRYPTED_BACKUP_FILENAME = "anothermonkey_backup.enc"

// Sync alarm name
const SYNC_ALARM_NAME = "cloud_sync_backup";

// Default sync interval in minutes (24 hours = 1440 minutes)
const DEFAULT_SYNC_INTERVAL_MINUTES = 1440;

// Sync frequency options in minutes
const SYNC_FREQUENCY_OPTIONS = [
  { value: 60, label: "Hourly" },
  { value: 1440, label: "Daily" },
  { value: 10080, label: "Weekly" }
];

export interface CloudBackupData {
    version: number;
    timestamp: number;
    scripts: UserScript[];
    permissions: any[];
}

export interface RestoreConflict {
    scriptId: string;
    scriptName: string;
    localVersion: string;
    remoteVersion: string;
    localLastModified: number;
    remoteLastModified: number;
}

export interface RestoreResult {
    conflicts: RestoreConflict[];
    imported: number;
    skipped: number;
}

export async function getAuthToken(interactive: boolean = false): Promise<string> {
    return new Promise((resolve, reject) => {
        (chrome as any).identity.getAuthToken({ interactive }, (token: string | undefined) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else if (!token) {
                reject(new Error("Failed to obtain auth token"));
            } else {
                resolve(token);
            }
        });
    });
}

export async function findBackupFile(token: string, encrypted: boolean = true): Promise<string | null> {
    const filename = encrypted ? ENCRYPTED_BACKUP_FILENAME : BACKUP_FILENAME;
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${filename}' and trashed=false`,
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to list files: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }
    return null;
}

export async function uploadBackup(token: string, fileId: string | null, encryptionPassword?: string): Promise<void> {
    const scripts = await db.scripts.toArray();
    const permissions = await db.permissions.toArray();
    
    const backupData: CloudBackupData = {
        version: 1,
        timestamp: Date.now(),
        scripts,
        permissions
    };

    let fileContent: string;
    let filename: string;
    let mimeType: string;

    if (encryptionPassword) {
        // Encrypt the backup data
        fileContent = await encryptData(JSON.stringify(backupData), encryptionPassword);
        filename = ENCRYPTED_BACKUP_FILENAME;
        mimeType = "application/octet-stream";
    } else {
        fileContent = JSON.stringify(backupData);
        filename = BACKUP_FILENAME;
        mimeType = "application/json";
    }

    const metadata = {
        name: filename,
        mimeType
    };

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([fileContent], { type: mimeType }));

    let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    let method = "POST";

    if (fileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = "PATCH";
    }

    const response = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: form
    });

    if (!response.ok) {
        throw new Error(`Failed to upload backup: ${response.statusText}`);
    }
}

export async function downloadBackup(token: string, fileId: string, encryptionPassword?: string): Promise<CloudBackupData> {
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to download backup: ${response.statusText}`);
    }

    const rawData = await response.text();
    
    // Check if data is encrypted
    if (isEncrypted(rawData)) {
        if (!encryptionPassword) {
            throw new Error("Backup is encrypted but no password was provided");
        }
        const decrypted = await decryptData(rawData, encryptionPassword);
        return JSON.parse(decrypted);
    }
    
    return JSON.parse(rawData);
}

/**
 * Performs a cloud backup and updates the last sync timestamp
 */
export async function performCloudBackup(): Promise<void> {
    try {
        const token = await getAuthToken(true);
        const fileId = await findBackupFile(token);
        await uploadBackup(token, fileId);
        // Update last sync timestamp
        await chrome.storage.local.set({ lastCloudSyncTimestamp: Date.now() });
    } catch (error) {
        console.error("Auto-backup failed:", error);
        throw error;
    }
}

/**
 * Sets up the periodic sync alarm
 * @param intervalMinutes The interval in minutes for the sync alarm
 */
export function setupSyncAlarm(intervalMinutes: number): void {
    // Clear existing alarm first
    chrome.alarms.clear(SYNC_ALARM_NAME, () => {
        // Create new periodic alarm
        chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: intervalMinutes });
        console.log(`Cloud sync alarm set for every ${intervalMinutes} minutes`);
    });
}

/**
 * Clears the scheduled sync alarm
 */
export function clearSyncAlarm(): void {
    chrome.alarms.clear(SYNC_ALARM_NAME, () => {
        console.log("Cloud sync alarm cleared");
    });
}

/**
 * Gets the current sync interval from storage
 */
export async function getSyncIntervalMinutes(): Promise<number> {
    const result = await chrome.storage.local.get("syncIntervalMinutes");
    return (result.syncIntervalMinutes as number) || DEFAULT_SYNC_INTERVAL_MINUTES;
}

/**
 * Gets the auto-sync enabled status from storage
 */
export async function getAutoSyncEnabled(): Promise<boolean> {
    const result = await chrome.storage.local.get("autoSyncEnabled");
    return result.autoSyncEnabled === true;
}

/**
 * Saves the auto-sync enabled status to storage
 */
export async function setAutoSyncEnabled(enabled: boolean): Promise<void> {
    await chrome.storage.local.set({ autoSyncEnabled: enabled });
}

/**
 * Saves the sync interval to storage and updates the alarm
 */
export async function setSyncIntervalMinutes(intervalMinutes: number): Promise<void> {
    await chrome.storage.local.set({ syncIntervalMinutes: intervalMinutes });
}

/**
 * Gets the last sync timestamp from storage
 */
export async function getLastSyncTimestamp(): Promise<number | null> {
    const result = await chrome.storage.local.get("lastCloudSyncTimestamp");
    return (result.lastCloudSyncTimestamp as number) || null;
}

/**
 * Configures auto-sync with the given settings
 */
export async function configureAutoSync(enabled: boolean, intervalMinutes?: number): Promise<void> {
    await setAutoSyncEnabled(enabled);
    
    if (enabled) {
        const interval = intervalMinutes || await getSyncIntervalMinutes();
        await setSyncIntervalMinutes(interval);
        setupSyncAlarm(interval);
    } else {
        clearSyncAlarm();
    }
}

/**
 * Analyzes conflicts between local and remote scripts
 */
export async function analyzeConflicts(backupData: CloudBackupData): Promise<RestoreConflict[]> {
    const conflicts: RestoreConflict[] = [];
    
    for (const remoteScript of backupData.scripts) {
        const localScript = await db.scripts.get(remoteScript.id);
        if (localScript) {
            // Check if there's a conflict (both modified differently)
            if (localScript.lastModified !== remoteScript.lastModified &&
                localScript.code !== remoteScript.code) {
                conflicts.push({
                    scriptId: remoteScript.id,
                    scriptName: remoteScript.metadata.name,
                    localVersion: localScript.metadata.version,
                    remoteVersion: remoteScript.metadata.version,
                    localLastModified: localScript.lastModified,
                    remoteLastModified: remoteScript.lastModified
                });
            }
        }
    }
    
    return conflicts;
}

/**
 * Restores backup with conflict handling
 * @param backupData The backup data to restore
 * @param overwriteConflicts If true, remote version wins; if false, skip conflicts
 * @param conflictResolutions Optional map of scriptId -> 'local' | 'remote' for specific resolutions
 */
export async function restoreFromBackup(
    backupData: CloudBackupData,
    overwriteConflicts: boolean = false,
    conflictResolutions?: Map<string, 'local' | 'remote'>
): Promise<RestoreResult> {
    const result: RestoreResult = {
        conflicts: [],
        imported: 0,
        skipped: 0
    };
    
    for (const remoteScript of backupData.scripts) {
        const localScript = await db.scripts.get(remoteScript.id);
        
        if (localScript) {
            const hasConflict = localScript.lastModified !== remoteScript.lastModified &&
                               localScript.code !== remoteScript.code;
            
            if (hasConflict) {
                const resolution = conflictResolutions?.get(remoteScript.id);
                
                if (resolution === 'remote' || (overwriteConflicts && !resolution)) {
                    await db.scripts.put(remoteScript);
                    result.imported++;
                } else if (resolution === 'local' || !overwriteConflicts) {
                    result.skipped++;
                    result.conflicts.push({
                        scriptId: remoteScript.id,
                        scriptName: remoteScript.metadata.name,
                        localVersion: localScript.metadata.version,
                        remoteVersion: remoteScript.metadata.version,
                        localLastModified: localScript.lastModified,
                        remoteLastModified: remoteScript.lastModified
                    });
                }
            } else {
                // No conflict, use newer version
                if (remoteScript.lastModified > localScript.lastModified) {
                    await db.scripts.put(remoteScript);
                    result.imported++;
                } else {
                    result.skipped++;
                }
            }
        } else {
            // New script, import it
            await db.scripts.put(remoteScript);
            result.imported++;
        }
    }

    for (const perm of backupData.permissions) {
        await db.permissions.put(perm);
    }
    
    return result;
}

