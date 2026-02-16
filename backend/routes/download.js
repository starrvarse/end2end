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

        // Collect all chunks from devices in order
        const chunkBuffers = [];

        for (let i = 0; i < fileEntry.totalChunks; i++) {
            const chunkInfo = chunkMap.find((c) => c.chunkIndex === i);
            if (!chunkInfo) {
                return res.status(500).json({ error: `Chunk ${i} mapping not found` });
            }

            const device = connectedDevices.get(chunkInfo.deviceId);
            if (!device) {
                return res.status(503).json({
                    error: `Device "${chunkInfo.deviceId}" is offline. Cannot retrieve chunk ${i}. File unavailable.`,
                });
            }

            const chunkData = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error(`Timeout getting chunk ${i}`)), 30000);

                device.socket.emit('getChunk', {
                    fileId: fileEntry.id,
                    chunkIndex: i,
                }, (response) => {
                    clearTimeout(timeout);
                    if (response && response.data) {
                        resolve(Buffer.from(response.data, 'base64'));
                    } else {
                        reject(new Error(`Device failed to return chunk ${i}`));
                    }
                });
            });

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
