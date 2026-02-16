import { Router } from 'express';
import { FILES_JSON, readJSON } from '../utils/fileHelpers.js';

const router = Router();

/**
 * GET /download/:fileName
 * Collect chunks from actual devices via WebSocket and stream the reassembled file.
 */
router.get('/:fileName', async (req, res) => {
    try {
        const { fileName } = req.params;

        if (!fileName) {
            return res.status(400).json({ error: 'File name is required' });
        }

        const files = readJSON(FILES_JSON) || [];
        const fileEntry = files.find((f) => f.name === fileName);

        if (!fileEntry) {
            return res.status(404).json({ error: 'File not found' });
        }

        const connectedDevices = req.app.get('connectedDevices');

        // Collect all chunks from devices in order
        const chunkBuffers = [];

        for (let i = 0; i < fileEntry.totalChunks; i++) {
            const chunkInfo = fileEntry.chunkMap.find((c) => c.chunkIndex === i);
            if (!chunkInfo) {
                return res.status(500).json({ error: `Chunk ${i} mapping not found` });
            }

            const device = connectedDevices.get(chunkInfo.deviceId);
            if (!device) {
                return res.status(503).json({
                    error: `Device "${chunkInfo.deviceId}" is offline. Cannot retrieve chunk ${i}. File unavailable.`,
                });
            }

            // Request the chunk from the device via WebSocket
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
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', fullFile.length);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(fullFile);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: error.message || 'Failed to download file' });
    }
});

export default router;
