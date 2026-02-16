/**
 * RSA-OAEP 4096-bit key pair management for secure key exchange.
 * Uses Web Crypto API in secure contexts (HTTPS/localhost).
 * Falls back to node-forge in insecure contexts (HTTP on LAN).
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

import { bufferToBase64, base64ToBuffer } from './crypto.js';

// Detect SubtleCrypto availability
const hasSubtle = typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.subtle !== 'undefined';

// Lazy-load node-forge only when needed
let _forge = null;
async function getForge() {
    if (!_forge) {
        const mod = await import('node-forge');
        _forge = mod.default || mod;
    }
    return _forge;
}

// In-memory private key (cleared on logout)
let _privateKey = null;
let _publicKey = null;

/**
 * Generate a new RSA-OAEP 4096-bit key pair
 */
export async function generateKeyPair() {
    if (hasSubtle) {
        return crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 4096,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256',
            },
            true,
            ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
        );
    }

    // Fallback: node-forge
    const forge = await getForge();
    return new Promise((resolve, reject) => {
        forge.pki.rsa.generateKeyPair({ bits: 4096, workers: -1 }, (err, keypair) => {
            if (err) return reject(err);
            resolve({
                publicKey: { _forge: true, _key: keypair.publicKey },
                privateKey: { _forge: true, _key: keypair.privateKey },
            });
        });
    });
}

/**
 * Export public key to base64 (SPKI format)
 */
export async function exportPublicKey(key) {
    if (key._forge) {
        const forge = await getForge();
        const pem = forge.pki.publicKeyToPem(key._key);
        const der = forge.asn1.toDer(forge.pki.publicKeyToAsn1(key._key)).getBytes();
        return forgeStringToBase64(der);
    }
    const exported = await crypto.subtle.exportKey('spki', key);
    return bufferToBase64(exported);
}

/**
 * Import a public key from base64 (SPKI format)
 */
export async function importPublicKey(base64Key) {
    if (hasSubtle) {
        const keyBuffer = base64ToBuffer(base64Key);
        return crypto.subtle.importKey(
            'spki',
            keyBuffer,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            true,
            ['encrypt', 'wrapKey']
        );
    }

    // Fallback: node-forge
    const forge = await getForge();
    const der = base64ToForgeString(base64Key);
    const asn1 = forge.asn1.fromDer(der);
    const publicKey = forge.pki.publicKeyFromAsn1(asn1);
    return { _forge: true, _key: publicKey };
}

/**
 * Export private key to ArrayBuffer (PKCS8 format)
 */
export async function exportPrivateKey(key) {
    if (key._forge) {
        const forge = await getForge();
        const asn1 = forge.pki.privateKeyToAsn1(key._key);
        const p8 = forge.pki.wrapRsaPrivateKey(asn1);
        const der = forge.asn1.toDer(p8).getBytes();
        return forgeStringToBuffer(der);
    }
    return crypto.subtle.exportKey('pkcs8', key);
}

/**
 * Import private key from ArrayBuffer (PKCS8 format)
 */
export async function importPrivateKey(keyBuffer) {
    if (hasSubtle) {
        return crypto.subtle.importKey(
            'pkcs8',
            keyBuffer,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false,
            ['decrypt', 'unwrapKey']
        );
    }

    // Fallback: node-forge — convert PKCS8 DER to PEM and import
    const forge = await getForge();
    const bytes = new Uint8Array(keyBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    // Convert DER to PEM format that forge can parse
    const b64 = forge.util.encode64(binary);
    const pem = '-----BEGIN PRIVATE KEY-----\n' + b64.match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----';
    const privateKey = forge.pki.privateKeyFromPem(pem);
    return { _forge: true, _key: privateKey };
}

/**
 * Derive an AES-256 key from password using PBKDF2 (fallback-aware)
 */
async function deriveKeyFromPassword(password, salt) {
    if (hasSubtle) {
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
                iterations: 600000,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // Fallback: node-forge PBKDF2
    const forge = await getForge();
    const saltStr = String.fromCharCode(...salt);
    const derivedBytes = forge.pkcs5.pbkdf2(password, saltStr, 600000, 32, forge.md.sha256.create());
    const keyBytes = new Uint8Array(derivedBytes.length);
    for (let i = 0; i < derivedBytes.length; i++) keyBytes[i] = derivedBytes.charCodeAt(i);
    return { _raw: keyBytes };
}

/**
 * AES-GCM encrypt helper (uses crypto.subtle or node-forge)
 */
async function aesGcmEncrypt(key, iv, data) {
    if (key._raw) {
        const forge = await getForge();
        const keyStr = uint8ToForgeStr(key._raw);
        const ivStr = uint8ToForgeStr(iv);
        const cipher = forge.cipher.createCipher('AES-GCM', keyStr);
        cipher.start({ iv: ivStr, tagLength: 128 });
        cipher.update(forge.util.createBuffer(uint8ToForgeStr(new Uint8Array(data))));
        cipher.finish();
        const encrypted = cipher.output.getBytes();
        const tag = cipher.mode.tag.getBytes();
        // ciphertext + tag (16 bytes) appended
        const result = new Uint8Array(encrypted.length + tag.length);
        for (let i = 0; i < encrypted.length; i++) result[i] = encrypted.charCodeAt(i);
        for (let i = 0; i < tag.length; i++) result[encrypted.length + i] = tag.charCodeAt(i);
        return result;
    }
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return new Uint8Array(ciphertext);
}

/**
 * AES-GCM decrypt helper (uses crypto.subtle or node-forge)
 */
async function aesGcmDecrypt(key, iv, data) {
    if (key._raw) {
        const forge = await getForge();
        const dataArr = new Uint8Array(data);
        const encData = dataArr.slice(0, dataArr.length - 16);
        const tag = dataArr.slice(dataArr.length - 16);
        const decipher = forge.cipher.createDecipher('AES-GCM', uint8ToForgeStr(key._raw));
        decipher.start({
            iv: uint8ToForgeStr(iv),
            tagLength: 128,
            tag: forge.util.createBuffer(uint8ToForgeStr(tag)),
        });
        decipher.update(forge.util.createBuffer(uint8ToForgeStr(encData)));
        const ok = decipher.finish();
        if (!ok) throw new Error('AES-GCM decryption failed (auth tag mismatch)');
        const decrypted = decipher.output.getBytes();
        const result = new Uint8Array(decrypted.length);
        for (let i = 0; i < decrypted.length; i++) result[i] = decrypted.charCodeAt(i);
        return result;
    }
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new Uint8Array(plaintext);
}

function uint8ToForgeStr(uint8) {
    let str = '';
    for (let i = 0; i < uint8.length; i++) str += String.fromCharCode(uint8[i]);
    return str;
}

/**
 * Encrypt the private key with a password-derived key
 */
export async function encryptPrivateKeyWithPassword(privateKey, password) {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const privateKeyBuffer = await exportPrivateKey(privateKey);
    const derivedKey = await deriveKeyFromPassword(password, salt);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await aesGcmEncrypt(derivedKey, iv, privateKeyBuffer);

    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.length);

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
    const derivedKey = await deriveKeyFromPassword(password, salt);

    const iv = encryptedData.slice(0, 12);
    const ciphertext = encryptedData.slice(12);

    const privateKeyBuffer = await aesGcmDecrypt(derivedKey, iv, ciphertext);
    return importPrivateKey(privateKeyBuffer.buffer);
}

/**
 * Wrap (encrypt) an AES key with a recipient's RSA public key
 */
export async function wrapAESKey(aesKeyBase64, recipientPublicKey) {
    let publicKey = recipientPublicKey;
    if (typeof recipientPublicKey === 'string') {
        publicKey = await importPublicKey(recipientPublicKey);
    }

    const aesKeyBuffer = base64ToBuffer(aesKeyBase64);

    if (publicKey._forge) {
        const forge = await getForge();
        const keyBytes = new Uint8Array(aesKeyBuffer);
        let binary = '';
        for (let i = 0; i < keyBytes.length; i++) binary += String.fromCharCode(keyBytes[i]);
        const encrypted = publicKey._key.encrypt(binary, 'RSA-OAEP', {
            md: forge.md.sha256.create(),
            mgf1: { md: forge.md.sha256.create() },
        });
        return forgeStringToBase64(encrypted);
    }

    const wrapped = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        aesKeyBuffer
    );
    return bufferToBase64(wrapped);
}

/**
 * Unwrap (decrypt) an AES key using our private key
 */
export async function unwrapAESKey(wrappedKeyBase64, privateKey) {
    const key = privateKey || _privateKey;
    if (!key) {
        throw new Error('No private key available. Please log in first.');
    }

    const wrappedBuffer = base64ToBuffer(wrappedKeyBase64);

    if (key._forge) {
        const forge = await getForge();
        const wrappedBytes = new Uint8Array(wrappedBuffer);
        let binary = '';
        for (let i = 0; i < wrappedBytes.length; i++) binary += String.fromCharCode(wrappedBytes[i]);
        const decrypted = key._key.decrypt(binary, 'RSA-OAEP', {
            md: forge.md.sha256.create(),
            mgf1: { md: forge.md.sha256.create() },
        });
        return forgeStringToBase64(decrypted);
    }

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

// --- Forge string <-> base64/buffer helpers ---

function forgeStringToBase64(str) {
    let binary = '';
    for (let i = 0; i < str.length; i++) {
        binary += String.fromCharCode(str.charCodeAt(i) & 0xff);
    }
    return btoa(binary);
}

function base64ToForgeString(base64) {
    const binary = atob(base64);
    return binary;
}

function forgeStringToBuffer(str) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i) & 0xff;
    }
    return bytes.buffer;
}
