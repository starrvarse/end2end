/**
 * End-to-end encryption using AES-256-GCM.
 * Uses Web Crypto API (crypto.subtle) in secure contexts (HTTPS/localhost).
 * Falls back to node-forge in insecure contexts (HTTP on LAN).
 *
 * - Key is generated client-side and NEVER sent to the server.
 * - File data is encrypted before leaving the browser.
 * - Only the device with the key can decrypt.
 */
import forge from 'node-forge';

// Detect SubtleCrypto availability (requires secure context: HTTPS or localhost)
const hasSubtle = typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.subtle !== 'undefined';

/**
 * Generate a new AES-256-GCM encryption key
 */
export async function generateKey() {
    if (hasSubtle) {
        return crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }
    // Fallback: raw 32-byte key
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    return { _raw: rawKey };
}

/**
 * Export a CryptoKey (or fallback key) to a storable base64 string
 */
export async function exportKey(key) {
    if (key._raw) {
        return bufferToBase64(key._raw.buffer);
    }
    const rawKey = await crypto.subtle.exportKey('raw', key);
    return bufferToBase64(rawKey);
}

/**
 * Import a base64 string back into a CryptoKey (or fallback key)
 */
export async function importKey(base64Key) {
    const rawKey = base64ToBuffer(base64Key);
    if (hasSubtle) {
        return crypto.subtle.importKey(
            'raw',
            rawKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );
    }
    return { _raw: new Uint8Array(rawKey) };
}

/**
 * Encrypt a data buffer using AES-256-GCM
 * @param {ArrayBuffer} data - The plaintext data
 * @param {CryptoKey|object} key - The encryption key
 * @returns {Promise<ArrayBuffer>} - IV (12 bytes) + ciphertext + auth tag
 */
export async function encryptData(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));

    if (key._raw) {
        const cipher = forge.cipher.createCipher('AES-GCM', forgeBufferFromUint8(key._raw));
        cipher.start({ iv: forgeBufferFromUint8(iv), tagLength: 128 });
        cipher.update(forge.util.createBuffer(forgeBufferFromUint8(new Uint8Array(data))));
        cipher.finish();
        const encrypted = cipher.output.getBytes();
        const tag = cipher.mode.tag.getBytes();
        // Format: IV (12) + ciphertext + tag (16)
        const result = new Uint8Array(12 + encrypted.length + 16);
        result.set(iv, 0);
        for (let i = 0; i < encrypted.length; i++) result[12 + i] = encrypted.charCodeAt(i);
        for (let i = 0; i < tag.length; i++) result[12 + encrypted.length + i] = tag.charCodeAt(i);
        return result.buffer;
    }

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    );

    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), iv.length);
    return result.buffer;
}

/**
 * Decrypt data that was encrypted with encryptData()
 * @param {ArrayBuffer} encryptedData - IV (12 bytes) + ciphertext + auth tag
 * @param {CryptoKey|object} key - The decryption key
 * @returns {Promise<ArrayBuffer>} - The decrypted plaintext
 */
export async function decryptData(encryptedData, key) {
    const dataArray = new Uint8Array(encryptedData);
    const iv = dataArray.slice(0, 12);
    const ciphertext = dataArray.slice(12);

    if (key._raw) {
        // Last 16 bytes are the GCM auth tag
        const encData = ciphertext.slice(0, ciphertext.length - 16);
        const tag = ciphertext.slice(ciphertext.length - 16);
        const decipher = forge.cipher.createDecipher('AES-GCM', forgeBufferFromUint8(key._raw));
        decipher.start({
            iv: forgeBufferFromUint8(iv),
            tagLength: 128,
            tag: forge.util.createBuffer(forgeBufferFromUint8(tag)),
        });
        decipher.update(forge.util.createBuffer(forgeBufferFromUint8(encData)));
        const ok = decipher.finish();
        if (!ok) throw new Error('AES-GCM decryption failed (auth tag mismatch)');
        const decrypted = decipher.output.getBytes();
        const result = new Uint8Array(decrypted.length);
        for (let i = 0; i < decrypted.length; i++) result[i] = decrypted.charCodeAt(i);
        return result.buffer;
    }

    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );
}

/**
 * Encrypt an entire file
 */
export async function encryptFile(file, key) {
    const plaintext = await file.arrayBuffer();
    return encryptData(plaintext, key);
}

/**
 * Decrypt an encrypted file buffer using a base64-encoded AES key
 */
export async function decryptFile(encryptedData, base64Key) {
    const cryptoKey = await importKey(base64Key);
    return decryptData(encryptedData, cryptoKey);
}

// --- Utility converters ---

export function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// Convert Uint8Array to forge binary string
function forgeBufferFromUint8(uint8) {
    let str = '';
    for (let i = 0; i < uint8.length; i++) str += String.fromCharCode(uint8[i]);
    return str;
}
