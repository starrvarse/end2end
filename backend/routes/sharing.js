import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /share/direct
 * Share a file with a specific user by sending them the RSA-wrapped AES key
 */
router.post(
    '/direct',
    authenticate,
    [
        body('fileId').notEmpty().withMessage('fileId is required'),
        body('recipientId').notEmpty().withMessage('recipientId is required'),
        body('encryptedAESKey').notEmpty().withMessage('encryptedAESKey is required'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { fileId, recipientId, encryptedAESKey } = req.body;

            // Verify file exists and sender owns it or has access
            const file = await prisma.file.findUnique({ where: { id: fileId } });
            if (!file) {
                return res.status(404).json({ error: 'File not found' });
            }

            const senderHasAccess = file.ownerId === req.user.id ||
                await prisma.fileKeyShare.findUnique({
                    where: { fileId_userId: { fileId, userId: req.user.id } },
                });

            if (!senderHasAccess) {
                return res.status(403).json({ error: 'You do not have access to this file' });
            }

            // Verify recipient is a connection
            const isConnected = await prisma.connection.findFirst({
                where: {
                    status: 'accepted',
                    OR: [
                        { requesterId: req.user.id, receiverId: recipientId },
                        { requesterId: recipientId, receiverId: req.user.id },
                    ],
                },
            });

            if (!isConnected) {
                return res.status(403).json({ error: 'Recipient must be a connection' });
            }

            // Create or update the key share
            await prisma.fileKeyShare.upsert({
                where: { fileId_userId: { fileId, userId: recipientId } },
                create: { fileId, userId: recipientId, encryptedAESKey },
                update: { encryptedAESKey },
            });

            // Notify recipient in real-time
            const io = req.app.get('io');
            const authenticatedSockets = req.app.get('authenticatedSockets');
            if (authenticatedSockets) {
                const targetSockets = authenticatedSockets.get(recipientId);
                if (targetSockets) {
                    targetSockets.forEach((socketId) => {
                        io.to(socketId).emit('fileShared', {
                            fileId,
                            fileName: file.name,
                            sharedBy: req.user.username,
                        });
                    });
                }
            }

            res.json({ message: 'File shared successfully' });
        } catch (error) {
            console.error('Direct share error:', error);
            res.status(500).json({ error: 'Failed to share file' });
        }
    }
);

/**
 * POST /share/group
 * Share a file with all members of a group. Client sends wrapped keys for each member.
 */
router.post(
    '/group',
    authenticate,
    [
        body('fileId').notEmpty().withMessage('fileId is required'),
        body('groupId').notEmpty().withMessage('groupId is required'),
        body('encryptedKeys').isArray({ min: 1 }).withMessage('encryptedKeys array is required'),
        body('encryptedKeys.*.userId').notEmpty(),
        body('encryptedKeys.*.encryptedAESKey').notEmpty(),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { fileId, groupId, encryptedKeys } = req.body;

            // Verify file exists
            const file = await prisma.file.findUnique({ where: { id: fileId } });
            if (!file) {
                return res.status(404).json({ error: 'File not found' });
            }

            // Verify user is a group member
            const membership = await prisma.groupMember.findUnique({
                where: { groupId_userId: { groupId, userId: req.user.id } },
            });

            if (!membership) {
                return res.status(403).json({ error: 'You are not a member of this group' });
            }

            // Upsert key shares for each member
            const upserts = encryptedKeys.map((ek) =>
                prisma.fileKeyShare.upsert({
                    where: { fileId_userId: { fileId, userId: ek.userId } },
                    create: { fileId, userId: ek.userId, encryptedAESKey: ek.encryptedAESKey },
                    update: { encryptedAESKey: ek.encryptedAESKey },
                })
            );

            await Promise.all(upserts);

            res.json({ message: `File shared with ${encryptedKeys.length} group members` });
        } catch (error) {
            console.error('Group share error:', error);
            res.status(500).json({ error: 'Failed to share with group' });
        }
    }
);

/**
 * GET /share/key/:fileId
 * Get current user's encrypted AES key for a file
 */
router.get('/key/:fileId', authenticate, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const userId = req.user.id;

        const keyShare = await prisma.fileKeyShare.findUnique({
            where: {
                fileId_userId: { fileId, userId },
            },
        });

        if (keyShare) {
            return res.json({ encryptedAESKey: keyShare.encryptedAESKey, isPublic: false });
        }

        // Check if there's a public post with this file
        const publicPost = await prisma.post.findFirst({
            where: {
                fileId,
                visibility: 'public',
                publicFileKey: { not: null },
            },
        });

        if (publicPost) {
            return res.json({
                encryptedAESKey: null,
                publicFileKey: publicPost.publicFileKey,
                isPublic: true,
            });
        }

        // Check if user is a member of a group where this file was posted
        // If so, the key should have been shared but wasn't (e.g., member added after post)
        const groupPost = await prisma.post.findFirst({
            where: {
                fileId,
                visibility: 'group',
                groupId: { not: null },
            },
            include: {
                group: {
                    include: {
                        members: { where: { userId } },
                    },
                },
            },
        });

        if (groupPost && groupPost.group?.members?.length > 0) {
            // User IS a group member but has no key — the file owner needs to re-share
            // Check if the file owner has a self key share we can use to re-wrap
            const file = await prisma.file.findUnique({ where: { id: fileId } });
            if (file) {
                const ownerKeyShare = await prisma.fileKeyShare.findUnique({
                    where: { fileId_userId: { fileId, userId: file.ownerId } },
                });
                // We can't re-wrap server-side (we'd need the owner's private key).
                // But we can inform the client that the key exists and needs re-sharing.
                return res.status(403).json({
                    error: 'Key not shared with you yet',
                    needsReShare: true,
                    ownerId: file.ownerId,
                    groupId: groupPost.groupId,
                });
            }
        }

        return res.status(404).json({ error: 'No key found for this file' });
    } catch (error) {
        console.error('Get share key error:', error);
        res.status(500).json({ error: 'Failed to get file key' });
    }
});

/**
 * GET /share/recipients/:fileId
 * List who has access to a file (for the owner)
 */
router.get('/recipients/:fileId', authenticate, async (req, res) => {
    try {
        const file = await prisma.file.findUnique({ where: { id: req.params.fileId } });
        if (!file || file.ownerId !== req.user.id) {
            return res.status(403).json({ error: 'Only the owner can view recipients' });
        }

        const shares = await prisma.fileKeyShare.findMany({
            where: { fileId: req.params.fileId },
            include: {
                user: { select: { id: true, username: true, avatarId: true } },
            },
        });

        res.json({
            recipients: shares.map((s) => s.user),
        });
    } catch (error) {
        console.error('Get recipients error:', error);
        res.status(500).json({ error: 'Failed to get recipients' });
    }
});

/**
 * POST /share/self
 * Store your own wrapped AES key for a file you own (for multi-device access)
 */
router.post(
    '/self',
    authenticate,
    [
        body('fileId').notEmpty(),
        body('encryptedAESKey').notEmpty(),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { fileId, encryptedAESKey } = req.body;

            await prisma.fileKeyShare.upsert({
                where: { fileId_userId: { fileId, userId: req.user.id } },
                create: { fileId, userId: req.user.id, encryptedAESKey },
                update: { encryptedAESKey },
            });

            res.json({ message: 'Self key share stored' });
        } catch (error) {
            console.error('Self share error:', error);
            res.status(500).json({ error: 'Failed to store self key share' });
        }
    }
);

export default router;
