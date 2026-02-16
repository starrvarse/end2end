/**
 * IndexedDB helper for storing file chunks and encryption keys on the device.
 * Chunks: { key: "<fileId>_<chunkIndex>", data: base64string }
 * Keys:   { fileId: "<fileId>", encryptionKey: base64string }
 */

const DB_NAME = 'FileChunksDB';
const CHUNK_STORE = 'chunks';
const KEY_STORE = 'encryptionKeys';
const DB_VERSION = 2;

/**
 * Open (or create) the IndexedDB database
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(CHUNK_STORE)) {
                db.createObjectStore(CHUNK_STORE, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(KEY_STORE)) {
                db.createObjectStore(KEY_STORE, { keyPath: 'fileId' });
            }
        };

        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// ===== CHUNK OPERATIONS =====

/**
 * Store a chunk in IndexedDB
 */
export async function storeChunk(fileId, chunkIndex, base64Data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CHUNK_STORE, 'readwrite');
        const store = tx.objectStore(CHUNK_STORE);
        store.put({
            key: `${fileId}_${chunkIndex}`,
            fileId,
            chunkIndex,
            data: base64Data,
            storedAt: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Retrieve a chunk from IndexedDB
 */
export async function getChunk(fileId, chunkIndex) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CHUNK_STORE, 'readonly');
        const store = tx.objectStore(CHUNK_STORE);
        const request = store.get(`${fileId}_${chunkIndex}`);
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get count of all chunks stored on this device
 */
export async function getStoredChunkCount() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CHUNK_STORE, 'readonly');
        const store = tx.objectStore(CHUNK_STORE);
        const request = store.count();
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// ===== ENCRYPTION KEY OPERATIONS =====

/**
 * Store an encryption key for a file
 * @param {string} fileId
 * @param {string} base64Key - The exported AES key in base64
 */
export async function storeEncryptionKey(fileId, base64Key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_STORE, 'readwrite');
        const store = tx.objectStore(KEY_STORE);
        store.put({
            fileId,
            encryptionKey: base64Key,
            storedAt: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Retrieve an encryption key for a file
 * @param {string} fileId
 * @returns {Promise<{fileId: string, encryptionKey: string} | undefined>}
 */
export async function getEncryptionKey(fileId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_STORE, 'readonly');
        const store = tx.objectStore(KEY_STORE);
        const request = store.get(fileId);
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Check if this device has the encryption key for a file
 * @param {string} fileId
 * @returns {Promise<boolean>}
 */
export async function hasEncryptionKey(fileId) {
    const entry = await getEncryptionKey(fileId);
    return !!entry;
}
