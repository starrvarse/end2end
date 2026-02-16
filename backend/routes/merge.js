import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { CHUNKS_DIR } from '../utils/fileHelpers.js';
import { authenticate } from '../middleware/auth.js';
import prisma from '../utils/prisma.js';

const router = Router();

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * POST /merge
 * After all chunks are uploaded to the server temporarily,
 * distribute them to actual connected devices via WebSocket.
 * Each device stores chunks in its browser (IndexedDB).
 * Server only keeps metadata in Prisma DB.
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const { fileId, fileName, totalChunks, fileSize, encrypted } = req.body;

        if (!fileId || !fileName || !totalChunks) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const total = parseInt(totalChunks, 10);
        const chunkDir = path.join(CHUNKS_DIR, fileId);

        if (!fs.existsSync(chunkDir)) {
            return res.status(400).json({ error: 'Chunk directory not found' });
        }

        // Check all chunks exist
        for (let i = 0; i < total; i++) {
            if (!fs.existsSync(path.join(chunkDir, `${i}`))) {
                return res.status(400).json({ error: `Missing chunk ${i}` });
            }
        }

        // Prevent duplicates
        const existingFile = await prisma.file.findFirst({ where: { name: fileName, ownerId: req.user.id } });
        if (existingFile) {
            fs.rmSync(chunkDir, { recursive: true, force: true });
            return res.status(409).json({ error: `File "${fileName}" already exists` });
        }

        // Get connected devices
        const connectedDevices = req.app.get('connectedDevices');
        const deviceList = Array.from(connectedDevices.entries());

        if (deviceList.length === 0) {
            fs.rmSync(chunkDir, { recursive: true, force: true });
            return res.status(400).json({ error: 'No devices connected. Connect at least one device first.' });
        }

        // Calculate total size
        let totalSize = 0;
        for (let i = 0; i < total; i++) {
            totalSize += fs.statSync(path.join(chunkDir, `${i}`)).size;
        }

        // Distribute chunks to devices via WebSocket (round-robin)
        const chunkMap = [];
        const sendPromises = [];

        for (let i = 0; i < total; i++) {
            const deviceIndex = i % deviceList.length;
            const [deviceId, deviceInfo] = deviceList[deviceIndex];
            const chunkData = fs.readFileSync(path.join(chunkDir, `${i}`));

            const promise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error(`Timeout sending chunk ${i} to ${deviceId}`)), 30000);

                deviceInfo.socket.emit('storeChunk', {
                    fileId,
                    fileName,
                    chunkIndex: i,
                    totalChunks: total,
                    data: chunkData.toString('base64'),
                }, (ack) => {
                    clearTimeout(timeout);
                    if (ack && ack.success) {
                        resolve();
                    } else {
                        reject(new Error(`Device ${deviceId} failed to store chunk ${i}`));
                    }
                });
            });

            sendPromises.push(promise);
            chunkMap.push({ chunkIndex: i, deviceId });
        }

        // Wait for all chunks to be delivered to devices
        await Promise.all(sendPromises);

        // Save metadata to Prisma DB
        const fileEntry = await prisma.file.create({
            data: {
                id: fileId,
                name: fileName,
                size: totalSize,
                totalChunks: total,
                encrypted: !!encrypted,
                ownerId: req.user.id,
                chunkMap: JSON.stringify(chunkMap),
            },
        });

        // Delete temp chunks from server
        fs.rmSync(chunkDir, { recursive: true, force: true });

        // Log distribution
        console.log(`\n"${fileName}" distributed to devices:`);
        const grouped = {};
        chunkMap.forEach((c) => {
            if (!grouped[c.deviceId]) grouped[c.deviceId] = [];
            grouped[c.deviceId].push(c.chunkIndex);
        });
        for (const [dev, chunks] of Object.entries(grouped)) {
            console.log(`   ${dev}: chunks [${chunks.join(', ')}]`);
        }

        // Notify all clients to refresh
        const io = req.app.get('io');
        io.emit('filesUpdated');

        res.json({
            message: `File distributed across ${deviceList.length} device(s)`,
            file: {
                id: fileEntry.id,
                name: fileEntry.name,
                size: fileEntry.size,
                sizeFormatted: formatFileSize(fileEntry.size),
                totalChunks: fileEntry.totalChunks,
                chunkMap,
                encrypted: fileEntry.encrypted,
                uploadDate: fileEntry.createdAt.toISOString(),
            },
        });
    } catch (error) {
        console.error('Merge/distribute error:', error);
        res.status(500).json({ error: error.message || 'Failed to distribute file' });
    }
});

export default router;
