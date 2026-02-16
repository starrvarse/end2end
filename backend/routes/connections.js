import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * GET /connections
 * List all accepted connections for current user
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const connections = await prisma.connection.findMany({
            where: {
                status: 'accepted',
                OR: [
                    { requesterId: req.user.id },
                    { receiverId: req.user.id },
                ],
            },
            include: {
                requester: { select: { id: true, username: true, avatarId: true, publicKey: true } },
                receiver: { select: { id: true, username: true, avatarId: true, publicKey: true } },
            },
        });

        // Return the "other" user in each connection
        const result = connections.map((conn) => {
            const otherUser = conn.requesterId === req.user.id ? conn.receiver : conn.requester;
            return {
                connectionId: conn.id,
                user: otherUser,
                connectedAt: conn.createdAt,
            };
        });

        res.json({ connections: result });
    } catch (error) {
        console.error('Get connections error:', error);
        res.status(500).json({ error: 'Failed to get connections' });
    }
});

/**
 * GET /connections/pending
 * List pending incoming connection requests
 */
router.get('/pending', authenticate, async (req, res) => {
    try {
        const pending = await prisma.connection.findMany({
            where: {
                receiverId: req.user.id,
                status: 'pending',
            },
            include: {
                requester: { select: { id: true, username: true, avatarId: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            requests: pending.map((p) => ({
                connectionId: p.id,
                from: p.requester,
                createdAt: p.createdAt,
            })),
        });
    } catch (error) {
        console.error('Get pending connections error:', error);
        res.status(500).json({ error: 'Failed to get pending requests' });
    }
});

/**
 * GET /connections/sent
 * List sent connection requests (pending)
 */
router.get('/sent', authenticate, async (req, res) => {
    try {
        const sent = await prisma.connection.findMany({
            where: {
                requesterId: req.user.id,
                status: 'pending',
            },
            include: {
                receiver: { select: { id: true, username: true, avatarId: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            requests: sent.map((s) => ({
                connectionId: s.id,
                to: s.receiver,
                createdAt: s.createdAt,
            })),
        });
    } catch (error) {
        console.error('Get sent connections error:', error);
        res.status(500).json({ error: 'Failed to get sent requests' });
    }
});

/**
 * GET /connections/search?q=username
 * Search users by username (partial match, exclude self and existing connections)
 */
router.get('/search', authenticate, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.status(400).json({ error: 'Search query must be at least 2 characters' });
        }

        // Find existing connection user IDs (any status)
        const existingConnections = await prisma.connection.findMany({
            where: {
                OR: [
                    { requesterId: req.user.id },
                    { receiverId: req.user.id },
                ],
            },
            select: { requesterId: true, receiverId: true },
        });

        const connectedUserIds = new Set();
        existingConnections.forEach((c) => {
            connectedUserIds.add(c.requesterId);
            connectedUserIds.add(c.receiverId);
        });
        connectedUserIds.add(req.user.id); // exclude self

        const users = await prisma.user.findMany({
            where: {
                username: { contains: q },
                id: { notIn: Array.from(connectedUserIds) },
            },
            select: { id: true, username: true, avatarId: true },
            take: 20,
        });

        res.json({ users });
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

/**
 * POST /connections/request
 * Send a connection request
 */
router.post(
    '/request',
    authenticate,
    [body('receiverId').notEmpty().withMessage('receiverId is required')],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { receiverId } = req.body;

            if (receiverId === req.user.id) {
                return res.status(400).json({ error: 'Cannot connect with yourself' });
            }

            // Check receiver exists
            const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
            if (!receiver) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Check for existing connection (either direction)
            const existing = await prisma.connection.findFirst({
                where: {
                    OR: [
                        { requesterId: req.user.id, receiverId },
                        { requesterId: receiverId, receiverId: req.user.id },
                    ],
                },
            });

            if (existing) {
                return res.status(409).json({ error: 'Connection already exists', status: existing.status });
            }

            const connection = await prisma.connection.create({
                data: {
                    requesterId: req.user.id,
                    receiverId,
                    status: 'pending',
                },
            });

            // Emit real-time notification
            const io = req.app.get('io');
            const authenticatedSockets = req.app.get('authenticatedSockets');
            if (authenticatedSockets) {
                const targetSockets = authenticatedSockets.get(receiverId);
                if (targetSockets) {
                    targetSockets.forEach((socketId) => {
                        io.to(socketId).emit('connectionRequest', {
                            connectionId: connection.id,
                            from: { id: req.user.id, username: req.user.username },
                        });
                    });
                }
            }

            res.status(201).json({ connectionId: connection.id, message: 'Connection request sent' });
        } catch (error) {
            console.error('Connection request error:', error);
            res.status(500).json({ error: 'Failed to send connection request' });
        }
    }
);

/**
 * POST /connections/:id/accept
 * Accept an incoming connection request
 */
router.post('/:id/accept', authenticate, async (req, res) => {
    try {
        const connection = await prisma.connection.findUnique({
            where: { id: req.params.id },
        });

        if (!connection) {
            return res.status(404).json({ error: 'Connection request not found' });
        }

        if (connection.receiverId !== req.user.id) {
            return res.status(403).json({ error: 'Only the receiver can accept' });
        }

        if (connection.status !== 'pending') {
            return res.status(400).json({ error: `Connection is already ${connection.status}` });
        }

        const updated = await prisma.connection.update({
            where: { id: req.params.id },
            data: { status: 'accepted' },
        });

        // Notify the requester
        const io = req.app.get('io');
        const authenticatedSockets = req.app.get('authenticatedSockets');
        if (authenticatedSockets) {
            const targetSockets = authenticatedSockets.get(connection.requesterId);
            if (targetSockets) {
                targetSockets.forEach((socketId) => {
                    io.to(socketId).emit('connectionAccepted', {
                        connectionId: connection.id,
                        by: { id: req.user.id, username: req.user.username },
                    });
                });
            }
        }

        res.json({ message: 'Connection accepted' });
    } catch (error) {
        console.error('Accept connection error:', error);
        res.status(500).json({ error: 'Failed to accept connection' });
    }
});

/**
 * POST /connections/:id/decline
 * Decline an incoming connection request
 */
router.post('/:id/decline', authenticate, async (req, res) => {
    try {
        const connection = await prisma.connection.findUnique({
            where: { id: req.params.id },
        });

        if (!connection) {
            return res.status(404).json({ error: 'Connection request not found' });
        }

        if (connection.receiverId !== req.user.id) {
            return res.status(403).json({ error: 'Only the receiver can decline' });
        }

        if (connection.status !== 'pending') {
            return res.status(400).json({ error: `Connection is already ${connection.status}` });
        }

        await prisma.connection.update({
            where: { id: req.params.id },
            data: { status: 'declined' },
        });

        res.json({ message: 'Connection declined' });
    } catch (error) {
        console.error('Decline connection error:', error);
        res.status(500).json({ error: 'Failed to decline connection' });
    }
});

/**
 * DELETE /connections/:id
 * Remove an existing connection
 */
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const connection = await prisma.connection.findUnique({
            where: { id: req.params.id },
        });

        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        if (connection.requesterId !== req.user.id && connection.receiverId !== req.user.id) {
            return res.status(403).json({ error: 'Not your connection' });
        }

        await prisma.connection.delete({ where: { id: req.params.id } });

        res.json({ message: 'Connection removed' });
    } catch (error) {
        console.error('Delete connection error:', error);
        res.status(500).json({ error: 'Failed to remove connection' });
    }
});

export default router;
