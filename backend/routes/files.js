import { Router } from 'express';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * GET /files
 * Return the list of files the current user owns or has access to
 */
router.get('/', authenticate, async (req, res) => {
    try {
        // Get user's own files
        const ownedFiles = await prisma.file.findMany({
            where: { ownerId: req.user.id },
            orderBy: { createdAt: 'desc' },
        });

        // Get files shared with user
        const sharedKeys = await prisma.fileKeyShare.findMany({
            where: { userId: req.user.id },
            include: {
                file: true,
            },
        });

        const sharedFiles = sharedKeys
            .filter((sk) => sk.file && sk.file.ownerId !== req.user.id)
            .map((sk) => sk.file);

        const allFiles = [...ownedFiles, ...sharedFiles];

        const files = allFiles.map((f) => ({
            id: f.id,
            name: f.name,
            size: f.size,
            sizeFormatted: formatFileSize(f.size),
            totalChunks: f.totalChunks,
            encrypted: f.encrypted,
            ownerId: f.ownerId,
            chunkMap: JSON.parse(f.chunkMap),
            uploadDate: f.createdAt.toISOString(),
            isOwner: f.ownerId === req.user.id,
        }));

        res.json({ files });
    } catch (error) {
        console.error('Error reading files:', error);
        res.status(500).json({ error: 'Failed to retrieve file list' });
    }
});

/**
 * POST /files/register
 * Register a new file's metadata. Chunks are stored ONLY on devices (IndexedDB).
 * Server never touches chunk data — true E2E architecture.
 */
router.post('/register', authenticate, async (req, res) => {
    try {
        const { fileId, fileName, totalChunks, fileSize, originalSize, encrypted } = req.body;

        if (!fileId || !fileName || !totalChunks) {
            return res.status(400).json({ error: 'Missing required fields: fileId, fileName, totalChunks' });
        }

        const total = parseInt(totalChunks, 10);
        const size = parseInt(fileSize || originalSize || 0, 10);

        // Prevent duplicates
        const existing = await prisma.file.findFirst({
            where: { name: fileName, ownerId: req.user.id },
        });
        if (existing) {
            return res.status(409).json({ error: `File "${fileName}" already exists` });
        }

        // Get the registering device's ID from connected devices
        const connectedDevices = req.app.get('connectedDevices');
        let uploaderDeviceId = null;
        for (const [deviceId, info] of connectedDevices.entries()) {
            if (info.userId === req.user.id) {
                uploaderDeviceId = deviceId;
                break;
            }
        }

        // Build chunk map — all chunks belong to the uploader's device
        const chunkMap = [];
        for (let i = 0; i < total; i++) {
            chunkMap.push({
                chunkIndex: i,
                deviceId: uploaderDeviceId || 'local',
            });
        }

        const fileEntry = await prisma.file.create({
            data: {
                id: fileId,
                name: fileName,
                size,
                totalChunks: total,
                encrypted: !!encrypted,
                ownerId: req.user.id,
                chunkMap: JSON.stringify(chunkMap),
            },
        });

        console.log(`File registered: "${fileName}" (${total} chunks, device: ${uploaderDeviceId || 'local'})`);

        // Notify all clients to refresh
        const io = req.app.get('io');
        io.emit('filesUpdated');

        res.json({
            message: 'File registered successfully',
            file: {
                id: fileEntry.id,
                name: fileEntry.name,
                size: fileEntry.size,
                totalChunks: fileEntry.totalChunks,
                encrypted: fileEntry.encrypted,
                uploadDate: fileEntry.createdAt.toISOString(),
            },
        });
    } catch (error) {
        console.error('File registration error:', error);
        res.status(500).json({ error: error.message || 'Failed to register file' });
    }
});

/**
 * DELETE /files/:fileId
 * Delete a file and all associated data (key shares, posts, comments, likes)
 */
router.delete('/:fileId', authenticate, async (req, res) => {
    try {
        const { fileId } = req.params;

        const file = await prisma.file.findUnique({ where: { id: fileId } });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        if (file.ownerId !== req.user.id) {
            return res.status(403).json({ error: 'Only the file owner can delete it' });
        }

        // Delete related records in order (foreign key constraints)
        // 1. Comments & likes on posts that reference this file
        const posts = await prisma.post.findMany({ where: { fileId } });
        const postIds = posts.map(p => p.id);
        if (postIds.length > 0) {
            await prisma.comment.deleteMany({ where: { postId: { in: postIds } } });
            await prisma.like.deleteMany({ where: { postId: { in: postIds } } });
        }
        // 2. Posts referencing this file
        await prisma.post.deleteMany({ where: { fileId } });
        // 3. Key shares
        await prisma.fileKeyShare.deleteMany({ where: { fileId } });
        // 4. The file itself
        await prisma.file.delete({ where: { id: fileId } });

        console.log(`File deleted: "${file.name}" by user ${req.user.id}`);

        // Notify clients
        const io = req.app.get('io');
        io.emit('filesUpdated');

        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('File deletion error:', error);
        res.status(500).json({ error: error.message || 'Failed to delete file' });
    }
});

export default router;
