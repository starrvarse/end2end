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

export default router;
