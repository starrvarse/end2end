import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /groups
 * Create a new group
 */
router.post(
    '/',
    authenticate,
    [
        body('name').trim().isLength({ min: 1, max: 50 }).withMessage('Group name must be 1-50 characters'),
        body('avatarId').optional().isInt({ min: 0, max: 11 }),
        body('memberIds').optional().isArray(),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, avatarId = 0, memberIds = [] } = req.body;

            // Verify all members are connections of the creator
            if (memberIds.length > 0) {
                const connections = await prisma.connection.findMany({
                    where: {
                        status: 'accepted',
                        OR: [
                            { requesterId: req.user.id, receiverId: { in: memberIds } },
                            { requesterId: { in: memberIds }, receiverId: req.user.id },
                        ],
                    },
                });

                const connectedIds = new Set();
                connections.forEach((c) => {
                    connectedIds.add(c.requesterId === req.user.id ? c.receiverId : c.requesterId);
                });

                const invalidIds = memberIds.filter((id) => !connectedIds.has(id));
                if (invalidIds.length > 0) {
                    return res.status(400).json({ error: 'All members must be your connections' });
                }
            }

            // Create group with creator as admin
            const group = await prisma.group.create({
                data: {
                    name,
                    avatarId,
                    creatorId: req.user.id,
                    members: {
                        create: [
                            { userId: req.user.id, role: 'admin' },
                            ...memberIds.map((id) => ({ userId: id, role: 'member' })),
                        ],
                    },
                },
                include: {
                    members: {
                        include: {
                            user: { select: { id: true, username: true, avatarId: true } },
                        },
                    },
                },
            });

            res.status(201).json({ group });
        } catch (error) {
            console.error('Create group error:', error);
            res.status(500).json({ error: 'Failed to create group' });
        }
    }
);

/**
 * GET /groups
 * List user's groups
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const memberships = await prisma.groupMember.findMany({
            where: { userId: req.user.id },
            include: {
                group: {
                    include: {
                        _count: { select: { members: true } },
                        creator: { select: { id: true, username: true } },
                    },
                },
            },
        });

        const groups = memberships.map((m) => ({
            ...m.group,
            role: m.role,
        }));

        res.json({ groups });
    } catch (error) {
        console.error('List groups error:', error);
        res.status(500).json({ error: 'Failed to list groups' });
    }
});

/**
 * GET /groups/:id
 * Group details with members
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        // Verify membership
        const membership = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId: req.params.id, userId: req.user.id } },
        });
        if (!membership) {
            return res.status(403).json({ error: 'You are not a member of this group' });
        }

        const group = await prisma.group.findUnique({
            where: { id: req.params.id },
            include: {
                creator: { select: { id: true, username: true, avatarId: true } },
                members: {
                    include: {
                        user: { select: { id: true, username: true, avatarId: true, publicKey: true } },
                    },
                },
                _count: { select: { posts: true } },
            },
        });

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        res.json({ group, userRole: membership.role });
    } catch (error) {
        console.error('Get group error:', error);
        res.status(500).json({ error: 'Failed to get group details' });
    }
});

/**
 * POST /groups/:id/members
 * Add members to a group (admin only)
 */
router.post(
    '/:id/members',
    authenticate,
    [body('memberIds').isArray({ min: 1 }).withMessage('memberIds array required')],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { memberIds } = req.body;
            const groupId = req.params.id;

            // Verify admin
            const membership = await prisma.groupMember.findUnique({
                where: { groupId_userId: { groupId, userId: req.user.id } },
            });
            if (!membership || membership.role !== 'admin') {
                return res.status(403).json({ error: 'Only admins can add members' });
            }

            // Verify all are connections
            const connections = await prisma.connection.findMany({
                where: {
                    status: 'accepted',
                    OR: [
                        { requesterId: req.user.id, receiverId: { in: memberIds } },
                        { requesterId: { in: memberIds }, receiverId: req.user.id },
                    ],
                },
            });

            const connectedIds = new Set();
            connections.forEach((c) => {
                connectedIds.add(c.requesterId === req.user.id ? c.receiverId : c.requesterId);
            });

            const validIds = memberIds.filter((id) => connectedIds.has(id));

            if (validIds.length === 0) {
                return res.status(400).json({ error: 'No valid connections to add' });
            }

            // Create memberships (skip existing)
            for (const userId of validIds) {
                await prisma.groupMember.upsert({
                    where: { groupId_userId: { groupId, userId } },
                    create: { groupId, userId, role: 'member' },
                    update: {},
                });
            }

            res.json({ message: `${validIds.length} member(s) added` });
        } catch (error) {
            console.error('Add members error:', error);
            res.status(500).json({ error: 'Failed to add members' });
        }
    }
);

/**
 * DELETE /groups/:id/members/:userId
 * Remove a member (admin or self-leave)
 */
router.delete('/:id/members/:userId', authenticate, async (req, res) => {
    try {
        const groupId = req.params.id;
        const targetUserId = req.params.userId;

        const myMembership = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId: req.user.id } },
        });

        if (!myMembership) {
            return res.status(403).json({ error: 'You are not in this group' });
        }

        const isSelf = targetUserId === req.user.id;
        const isAdmin = myMembership.role === 'admin';

        if (!isSelf && !isAdmin) {
            return res.status(403).json({ error: 'Only admins can remove other members' });
        }

        await prisma.groupMember.delete({
            where: { groupId_userId: { groupId, userId: targetUserId } },
        });

        res.json({ message: 'Member removed' });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ error: 'Failed to remove member' });
    }
});

export default router;
