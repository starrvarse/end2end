import { generateKey, exportKey, encryptFile } from './crypto';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const API_BASE = '/api';

/**
 * Upload a file with end-to-end encryption.
 * 1. Generate AES-256 key
 * 2. Encrypt the entire file client-side
 * 3. Split encrypted data into chunks
 * 4. Upload chunks to server
 * 5. Store key locally (never sent to server)
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

    // Step 3: Upload encrypted chunks
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, encryptedSize);
        const chunkData = encryptedBuffer.slice(start, end);
        const chunkBlob = new Blob([chunkData]);

        const formData = new FormData();
        formData.append('chunk', chunkBlob, `chunk-${chunkIndex}`);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('fileName', file.name);
        formData.append('fileId', fileId);
        formData.append('fileSize', encryptedSize.toString());

        const res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Chunk upload failed');
        }

        // Progress: 10% for encryption + 80% for upload + 10% for merge
        const uploadProgress = 10 + Math.round(((chunkIndex + 1) / totalChunks) * 80);
        onProgress(uploadProgress);
    }

    // Step 4: Tell server to distribute chunks to devices
    const mergeRes = await fetch(`${API_BASE}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fileId,
            fileName: file.name,
            totalChunks,
            fileSize: file.size, // original size for display
            encrypted: true,
        }),
    });

    if (!mergeRes.ok) {
        const err = await mergeRes.json();
        throw new Error(err.error || 'File distribution failed');
    }

    onProgress(100);

    return { fileId, key: exportedKey };
}

/**
 * Fetch the list of uploaded files
 */
export async function fetchFiles() {
    const res = await fetch(`${API_BASE}/files`);
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
