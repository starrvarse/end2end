/**
 * End-to-end encryption using AES-256-GCM via Web Crypto API.
 * - Key is generated client-side and NEVER sent to the server.
 * - File data is encrypted before leaving the browser.
 * - Only the device with the key can decrypt.
 */

/**
 * Generate a new AES-256-GCM encryption key
 * @returns {Promise<CryptoKey>}
 */
export async function generateKey() {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable — so we can export it for storage
        ['encrypt', 'decrypt']
    );
}

/**
 * Export a CryptoKey to a storable base64 string
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function exportKey(key) {
    const rawKey = await crypto.subtle.exportKey('raw', key);
    return bufferToBase64(rawKey);
}

/**
 * Import a base64 string back into a CryptoKey
 * @param {string} base64Key
 * @returns {Promise<CryptoKey>}
 */
export async function importKey(base64Key) {
    const rawKey = base64ToBuffer(base64Key);
    return crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );
}

/**
 * Encrypt a data buffer using AES-256-GCM
 * @param {ArrayBuffer} data - The plaintext data
 * @param {CryptoKey} key - The encryption key
 * @returns {Promise<ArrayBuffer>} - IV (12 bytes) + ciphertext
 */
export async function encryptData(data, key) {
    // Generate a random 12-byte IV for each encryption
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    );

    // Prepend IV to ciphertext so we can extract it during decryption
    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), iv.length);

    return result.buffer;
}

/**
 * Decrypt data that was encrypted with encryptData()
 * @param {ArrayBuffer} encryptedData - IV (12 bytes) + ciphertext
 * @param {CryptoKey} key - The decryption key
 * @returns {Promise<ArrayBuffer>} - The decrypted plaintext
 */
export async function decryptData(encryptedData, key) {
    const dataArray = new Uint8Array(encryptedData);

    // Extract the IV (first 12 bytes) and ciphertext (rest)
    const iv = dataArray.slice(0, 12);
    const ciphertext = dataArray.slice(12);

    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );
}

/**
 * Encrypt an entire file and return it as an ArrayBuffer
 * @param {File} file - The file to encrypt
 * @param {CryptoKey} key - The encryption key
 * @returns {Promise<ArrayBuffer>} - Encrypted file data
 */
export async function encryptFile(file, key) {
    const plaintext = await file.arrayBuffer();
    return encryptData(plaintext, key);
}

// --- Utility converters ---

function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
