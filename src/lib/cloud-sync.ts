import { db } from "./db"
import type { UserScript } from "./types"

const BACKUP_FILENAME = "anothermonkey_backup.json"

export interface CloudBackupData {
    version: number;
    timestamp: number;
    scripts: UserScript[];
    permissions: any[];
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

export async function findBackupFile(token: string): Promise<string | null> {
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILENAME}' and trashed=false`,
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

export async function uploadBackup(token: string, fileId: string | null): Promise<void> {
    const scripts = await db.scripts.toArray();
    const permissions = await db.permissions.toArray();
    
    const backupData: CloudBackupData = {
        version: 1,
        timestamp: Date.now(),
        scripts,
        permissions
    };

    const metadata = {
        name: BACKUP_FILENAME,
        mimeType: "application/json"
    };

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([JSON.stringify(backupData)], { type: "application/json" }));

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

export async function downloadBackup(token: string, fileId: string): Promise<CloudBackupData> {
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

    return await response.json();
}

export async function restoreFromBackup(backupData: CloudBackupData): Promise<void> {
    // Basic merge strategy: overwrite with remote version for each script
    // In a real app, we might want to prompt the user if there are conflicts
    for (const script of backupData.scripts) {
        await db.scripts.put(script);
    }

    for (const perm of backupData.permissions) {
        await db.permissions.put(perm);
    }
}
