import { Router } from 'express';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * GET /download/:fileId
 * Collect chunks from devices via WebSocket and stream the reassembled file.
 * Requires auth + file access (owner, key share, or public post).
 */
router.get('/:fileId', authenticate, async (req, res) => {
    try {
        const { fileId } = req.params;

        if (!fileId) {
            return res.status(400).json({ error: 'File ID is required' });
        }

        const fileEntry = await prisma.file.findUnique({ where: { id: fileId } });

        if (!fileEntry) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Check access: owner, has key share, or file is in a public post
        const isOwner = fileEntry.ownerId === req.user.id;
        const hasKeyShare = await prisma.fileKeyShare.findUnique({
            where: { fileId_userId: { fileId, userId: req.user.id } },
        });
        const hasPublicPost = await prisma.post.findFirst({
            where: { fileId, visibility: 'public' },
        });

        if (!isOwner && !hasKeyShare && !hasPublicPost) {
            return res.status(403).json({ error: 'You do not have access to this file' });
        }

        const connectedDevices = req.app.get('connectedDevices');
        const chunkMap = JSON.parse(fileEntry.chunkMap);

        // Build a list of all devices belonging to the file owner (fallback pool)
        const ownerDevices = [];
        for (const [devId, devInfo] of connectedDevices.entries()) {
            if (devInfo.userId === fileEntry.ownerId) {
                ownerDevices.push({ deviceId: devId, ...devInfo });
            }
        }

        // Also collect all connected devices as a last resort
        const allDevices = Array.from(connectedDevices.entries()).map(([devId, devInfo]) => ({
            deviceId: devId,
            ...devInfo,
        }));

        // Collect all chunks from devices in order
        const chunkBuffers = [];

        for (let i = 0; i < fileEntry.totalChunks; i++) {
            const chunkInfo = chunkMap.find((c) => c.chunkIndex === i);
            if (!chunkInfo) {
                return res.status(500).json({ error: `Chunk ${i} mapping not found` });
            }

            // Build a prioritized list of devices to try:
            // 1. The specific device from chunkMap
            // 2. Other owner devices
            // 3. All other connected devices
            const devicesToTry = [];
            const mappedDevice = connectedDevices.get(chunkInfo.deviceId);
            if (mappedDevice) {
                devicesToTry.push({ deviceId: chunkInfo.deviceId, ...mappedDevice });
            }
            for (const dev of ownerDevices) {
                if (dev.deviceId !== chunkInfo.deviceId) devicesToTry.push(dev);
            }
            for (const dev of allDevices) {
                if (!devicesToTry.some((d) => d.deviceId === dev.deviceId)) devicesToTry.push(dev);
            }

            if (devicesToTry.length === 0) {
                return res.status(503).json({
                    error: `No devices online. Cannot retrieve chunk ${i}. File unavailable.`,
                });
            }

            let chunkData = null;
            let lastError = null;

            for (const device of devicesToTry) {
                try {
                    chunkData = await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => reject(new Error('Timeout')), 15000);

                        device.socket.emit('getChunk', {
                            fileId: fileEntry.id,
                            chunkIndex: i,
                        }, (response) => {
                            clearTimeout(timeout);
                            if (response && response.data) {
                                resolve(Buffer.from(response.data, 'base64'));
                            } else {
                                reject(new Error(response?.error || 'No data'));
                            }
                        });
                    });
                    break; // Got the chunk successfully
                } catch (err) {
                    lastError = err;
                    console.log(`Device ${device.deviceId} failed for chunk ${i}: ${err.message}, trying next...`);
                }
            }

            if (!chunkData) {
                return res.status(503).json({
                    error: `Could not retrieve chunk ${i} from any device. Last error: ${lastError?.message}`,
                });
            }

            chunkBuffers.push(chunkData);
        }

        // Stream the reassembled file
        const fullFile = Buffer.concat(chunkBuffers);
        res.setHeader('Content-Disposition', `attachment; filename="${fileEntry.name}"`);
        res.setHeader('Content-Length', fullFile.length);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(fullFile);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: error.message || 'Failed to download file' });
    }
});

export default router;
