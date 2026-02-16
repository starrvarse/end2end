import { generateKey, exportKey, encryptFile, bufferToBase64 } from './crypto';
import { getAuthHeaders } from './authStore';
import { storeChunk, storeEncryptionKey } from './chunkStore';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const API_BASE = '/api';

/**
 * Upload a file with end-to-end encryption (authenticated).
 * 1. Generate AES-256 key
 * 2. Encrypt the entire file client-side
 * 3. Split encrypted data into chunks, store in IndexedDB
 * 4. Register file metadata with server (no chunk data sent to server!)
 * 5. Return key for wrapping/sharing
 *
 * Chunks live ONLY on devices (IndexedDB). Server only stores metadata.
 *
 * @param {File} file - The file to upload
 * @param {function} onProgress - Callback with progress percentage (0-100)
 * @returns {Promise<{fileId: string, key: string}>} - File ID and base64 encryption key
 */
export async function uploadFile(file, onProgress) {
    const fileId = generateId();

    // Step 1: Generate encryption key
    onProgress(0);
    const key = await generateKey();
    const exportedKey = await exportKey(key);

    // Step 2: Encrypt the full file
    const encryptedBuffer = await encryptFile(file, key);
    const encryptedSize = encryptedBuffer.byteLength;
    const totalChunks = Math.ceil(encryptedSize / CHUNK_SIZE);

    // Step 3: Split into chunks and store ONLY in local IndexedDB
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, encryptedSize);
        const chunkData = encryptedBuffer.slice(start, end);

        const base64Chunk = bufferToBase64(new Uint8Array(chunkData));
        await storeChunk(fileId, chunkIndex, base64Chunk);

        const uploadProgress = 10 + Math.round(((chunkIndex + 1) / totalChunks) * 70);
        onProgress(uploadProgress);
    }

    // Store encryption key locally for instant future downloads
    await storeEncryptionKey(fileId, exportedKey);

    // Step 4: Register file metadata with server (no chunk data sent!)
    const registerRes = await fetch(`${API_BASE}/files/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        body: JSON.stringify({
            fileId,
            fileName: file.name,
            totalChunks,
            fileSize: encryptedSize,
            originalSize: file.size,
            encrypted: true,
        }),
    });

    if (!registerRes.ok) {
        const err = await registerRes.json();
        throw new Error(err.error || 'File registration failed');
    }

    onProgress(100);

    return { fileId, key: exportedKey };
}

/**
 * Fetch the list of uploaded files (authenticated)
 */
export async function fetchFiles() {
    const res = await fetch(`${API_BASE}/files`, {
        headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch files');
    const data = await res.json();
    return data.files;
}

/**
 * Generate a simple unique ID
 */
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
