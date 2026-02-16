import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { CHUNKS_DIR, MAX_FILE_SIZE, CHUNK_SIZE } from '../utils/fileHelpers.js';

const router = Router();

// Configure multer to store chunks in memory temporarily
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: CHUNK_SIZE + 1024 }, // 5MB chunk + small buffer
});

/**
 * POST /upload
 * Receive a single file chunk
 * Body (multipart): chunk (file), chunkIndex, totalChunks, fileName, fileId, fileSize
 */
router.post('/', upload.single('chunk'), (req, res) => {
    try {
        const { chunkIndex, totalChunks, fileName, fileId, fileSize } = req.body;

        // --- Validation ---
        if (!req.file) {
            return res.status(400).json({ error: 'No chunk data received' });
        }

        if (!chunkIndex || !totalChunks || !fileName || !fileId) {
            return res.status(400).json({ error: 'Missing required fields: chunkIndex, totalChunks, fileName, fileId' });
        }

        const index = parseInt(chunkIndex, 10);
        const total = parseInt(totalChunks, 10);
        const size = parseInt(fileSize, 10);

        if (isNaN(index) || isNaN(total) || index < 0 || index >= total) {
            return res.status(400).json({ error: 'Invalid chunkIndex or totalChunks' });
        }

        // Validate total file size
        if (size > MAX_FILE_SIZE) {
            return res.status(400).json({ error: `File too large. Max allowed: ${MAX_FILE_SIZE / (1024 * 1024)} MB` });
        }

        // Create chunk directory for this file
        const chunkDir = path.join(CHUNKS_DIR, fileId);
        if (!fs.existsSync(chunkDir)) {
            fs.mkdirSync(chunkDir, { recursive: true });
        }

        // Save chunk to disk
        const chunkPath = path.join(chunkDir, `${index}`);
        fs.writeFileSync(chunkPath, req.file.buffer);

        res.json({
            message: `Chunk ${index + 1}/${total} uploaded`,
            chunkIndex: index,
            totalChunks: total,
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload chunk' });
    }
});

export default router;
