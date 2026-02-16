/**
 * RSA-OAEP 4096-bit key pair management for secure key exchange.
 * 
 * Architecture:
 * - Each user generates an RSA-OAEP key pair at signup
 * - Public key is stored on the server (for others to encrypt AES keys for you)
 * - Private key is encrypted with PBKDF2(password, salt) and stored on server
 * - On login, private key is decrypted in memory (never persisted unencrypted)
 * - AES file keys are "wrapped" (encrypted) with recipients' public keys
 * - Recipients unwrap (decrypt) with their private key to get the AES key
 * 
 * The server NEVER sees plaintext private keys or AES keys.
 */

// In-memory private key (cleared on logout)
let _privateKey = null;
let _publicKey = null;

/**
 * Generate a new RSA-OAEP 4096-bit key pair
 */
export async function generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: 'RSA-OAEP',
            modulusLength: 4096,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
        },
        true, // extractable
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );

    return keyPair;
}

/**
 * Export public key to base64 (SPKI format)
 */
export async function exportPublicKey(key) {
    const exported = await crypto.subtle.exportKey('spki', key);
    return bufferToBase64(exported);
}

/**
 * Import a public key from base64 (SPKI format)
 */
export async function importPublicKey(base64Key) {
    const keyBuffer = base64ToBuffer(base64Key);
    return crypto.subtle.importKey(
        'spki',
        keyBuffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['encrypt', 'wrapKey']
    );
}

/**
 * Export private key to ArrayBuffer (PKCS8 format)
 */
export async function exportPrivateKey(key) {
    return crypto.subtle.exportKey('pkcs8', key);
}

/**
 * Import private key from ArrayBuffer (PKCS8 format)
 */
export async function importPrivateKey(keyBuffer) {
    return crypto.subtle.importKey(
        'pkcs8',
        keyBuffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false, // non-extractable after import
        ['decrypt', 'unwrapKey']
    );
}

/**
 * Derive an AES-256 key from password using PBKDF2
 * @param {string} password - User's password
 * @param {Uint8Array} salt - Random salt
 * @returns {Promise<CryptoKey>} - AES-256-GCM key
 */
async function deriveKeyFromPassword(password, salt) {
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
            salt,
            iterations: 600000, // OWASP 2024 recommendation for SHA-256
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt the private key with a password-derived key
 * Returns base64-encoded blob: IV (12 bytes) + ciphertext
 */
export async function encryptPrivateKeyWithPassword(privateKey, password) {
    // Generate random salt for PBKDF2
    const salt = crypto.getRandomValues(new Uint8Array(32));

    // Export private key
    const privateKeyBuffer = await exportPrivateKey(privateKey);

    // Derive encryption key from password
    const derivedKey = await deriveKeyFromPassword(password, salt);

    // Encrypt private key with AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        privateKeyBuffer
    );

    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return {
        encryptedPrivateKey: bufferToBase64(combined.buffer),
        pbkdfSalt: bufferToBase64(salt.buffer),
    };
}

/**
 * Decrypt the private key using the user's password
 */
export async function decryptPrivateKeyWithPassword(encryptedPrivateKeyBase64, pbkdfSaltBase64, password) {
    const salt = new Uint8Array(base64ToBuffer(pbkdfSaltBase64));
    const encryptedData = new Uint8Array(base64ToBuffer(encryptedPrivateKeyBase64));

    // Derive the same key from password
    const derivedKey = await deriveKeyFromPassword(password, salt);

    // Extract IV and ciphertext
    const iv = encryptedData.slice(0, 12);
    const ciphertext = encryptedData.slice(12);

    // Decrypt
    const privateKeyBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        ciphertext
    );

    // Import as CryptoKey
    return importPrivateKey(privateKeyBuffer);
}

/**
 * Wrap (encrypt) an AES key with a recipient's RSA public key
 * @param {string} aesKeyBase64 - The raw AES key in base64
 * @param {CryptoKey|string} recipientPublicKey - RSA public key (CryptoKey or base64)
 * @returns {Promise<string>} - RSA-OAEP encrypted AES key in base64
 */
export async function wrapAESKey(aesKeyBase64, recipientPublicKey) {
    let publicKey = recipientPublicKey;
    if (typeof recipientPublicKey === 'string') {
        publicKey = await importPublicKey(recipientPublicKey);
    }

    const aesKeyBuffer = base64ToBuffer(aesKeyBase64);

    const wrapped = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        aesKeyBuffer
    );

    return bufferToBase64(wrapped);
}

/**
 * Unwrap (decrypt) an AES key using our private key
 * @param {string} wrappedKeyBase64 - RSA-OAEP encrypted AES key in base64
 * @param {CryptoKey} [privateKey] - RSA private key (defaults to in-memory key)
 * @returns {Promise<string>} - Raw AES key in base64
 */
export async function unwrapAESKey(wrappedKeyBase64, privateKey) {
    const key = privateKey || _privateKey;
    if (!key) {
        throw new Error('No private key available. Please log in first.');
    }

    const wrappedBuffer = base64ToBuffer(wrappedKeyBase64);

    const unwrapped = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        key,
        wrappedBuffer
    );

    return bufferToBase64(unwrapped);
}

/**
 * Store the decrypted private key in memory
 */
export function setPrivateKey(key) {
    _privateKey = key;
}

/**
 * Get the in-memory private key
 */
export function getPrivateKey() {
    return _privateKey;
}

/**
 * Store the public key in memory
 */
export function setPublicKey(key) {
    _publicKey = key;
}

/**
 * Get the in-memory public key
 */
export function getPublicKey() {
    return _publicKey;
}

/**
 * Clear all keys from memory (on logout)
 */
export function clearKeys() {
    _privateKey = null;
    _publicKey = null;
}

/**
 * Check if private key is available
 */
export function hasPrivateKey() {
    return _privateKey !== null;
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
