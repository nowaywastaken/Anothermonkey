/**
 * Crypto utilities for secure cloud sync backup
 * Uses Web Crypto API with AES-GCM encryption
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000;

/**
 * Derives an encryption key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt.buffer as ArrayBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: ALGORITHM, length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts data with a password
 * Returns base64-encoded string with format: salt:iv:ciphertext
 */
export async function encryptData(data: string, password: string): Promise<string> {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await deriveKey(password, salt);

    const encrypted = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        encoder.encode(data)
    );

    // Combine salt + iv + ciphertext into a single array
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    // Convert to base64
    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts data with a password
 * Expects base64-encoded string with format: salt:iv:ciphertext
 */
export async function decryptData(encryptedData: string, password: string): Promise<string> {
    const decoder = new TextDecoder();
    
    // Decode base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Extract salt, iv, and ciphertext
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
    
    const key = await deriveKey(password, salt);
    
    const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        ciphertext
    );
    
    return decoder.decode(decrypted);
}

/**
 * Generates a secure random password for encryption
 */
export function generateEncryptionPassword(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
}

/**
 * Checks if data appears to be encrypted (base64 with correct prefix length)
 */
export function isEncrypted(data: string): boolean {
    try {
        const decoded = atob(data);
        // Minimum length: salt(16) + iv(12) + some ciphertext
        return decoded.length >= SALT_LENGTH + IV_LENGTH + 16;
    } catch {
        return false;
    }
}
