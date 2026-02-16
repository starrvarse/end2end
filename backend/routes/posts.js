import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';

const router = Router();

/**
 * POST /posts
 * Create a new post (optionally with a file attachment)
 */
router.post(
    '/',
    authenticate,
    [
        body('caption').optional().isString().isLength({ max: 2000 }),
        body('visibility').isIn(['public', 'connections', 'group']).withMessage('Invalid visibility'),
        body('fileId').optional().isString(),
        body('groupId').optional().isString(),
        body('publicFileKey').optional().isString(),
        body('encryptedKeys').optional().isArray(),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { caption, visibility, fileId, groupId, publicFileKey, encryptedKeys } = req.body;

            // Validate group membership if posting to a group
            if (visibility === 'group') {
                if (!groupId) {
                    return res.status(400).json({ error: 'groupId required for group posts' });
                }
                const membership = await prisma.groupMember.findUnique({
                    where: { groupId_userId: { groupId, userId: req.user.id } },
                });
                if (!membership) {
                    return res.status(403).json({ error: 'You are not a member of this group' });
                }
            }

            // Validate file ownership if attaching a file
            if (fileId) {
                const file = await prisma.file.findUnique({ where: { id: fileId } });
                if (!file) {
                    return res.status(404).json({ error: 'File not found' });
                }
                if (file.ownerId !== req.user.id) {
                    const hasAccess = await prisma.fileKeyShare.findUnique({
                        where: { fileId_userId: { fileId, userId: req.user.id } },
                    });
                    if (!hasAccess) {
                        return res.status(403).json({ error: 'You do not have access to this file' });
                    }
                }
            }

            const post = await prisma.post.create({
                data: {
                    authorId: req.user.id,
                    fileId: fileId || null,
                    caption: caption || null,
                    visibility,
                    groupId: groupId || null,
                    publicFileKey: visibility === 'public' ? (publicFileKey || null) : null,
                },
                include: {
                    author: { select: { id: true, username: true, avatarId: true } },
                    file: { select: { id: true, name: true, size: true, encrypted: true } },
                    _count: { select: { comments: true, likes: true } },
                },
            });

            // If visibility is 'connections' and file attached, share keys with all connections
            if (visibility === 'connections' && fileId && encryptedKeys && encryptedKeys.length > 0) {
                const upserts = encryptedKeys.map((ek) =>
                    prisma.fileKeyShare.upsert({
                        where: { fileId_userId: { fileId, userId: ek.userId } },
                        create: { fileId, userId: ek.userId, encryptedAESKey: ek.encryptedAESKey },
                        update: { encryptedAESKey: ek.encryptedAESKey },
                    })
                );
                await Promise.all(upserts);
            }

            // If visibility is 'group' and file attached, share keys with group members
            if (visibility === 'group' && fileId && encryptedKeys && encryptedKeys.length > 0) {
                const upserts = encryptedKeys.map((ek) =>
                    prisma.fileKeyShare.upsert({
                        where: { fileId_userId: { fileId, userId: ek.userId } },
                        create: { fileId, userId: ek.userId, encryptedAESKey: ek.encryptedAESKey },
                        update: { encryptedAESKey: ek.encryptedAESKey },
                    })
                );
                await Promise.all(upserts);
            }

            // Real-time notification
            const io = req.app.get('io');
            io.emit('newPost', { postId: post.id, authorId: req.user.id, visibility });

            res.status(201).json({ post });
        } catch (error) {
            console.error('Create post error:', error);
            res.status(500).json({ error: 'Failed to create post' });
        }
    }
);

/**
 * GET /posts/feed
 * Paginated feed of posts the user has access to
 */
router.get('/feed', authenticate, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const skip = (page - 1) * limit;

        // Get user's connection IDs
        const connections = await prisma.connection.findMany({
            where: {
                status: 'accepted',
                OR: [
                    { requesterId: req.user.id },
                    { receiverId: req.user.id },
                ],
            },
        });

        const connectionUserIds = connections.map((c) =>
            c.requesterId === req.user.id ? c.receiverId : c.requesterId
        );

        // Get user's group IDs
        const groupMemberships = await prisma.groupMember.findMany({
            where: { userId: req.user.id },
            select: { groupId: true },
        });
        const groupIds = groupMemberships.map((gm) => gm.groupId);

        // Build feed query: public + connections' posts + group posts + own posts
        const posts = await prisma.post.findMany({
            where: {
                OR: [
                    { visibility: 'public' },
                    { visibility: 'connections', authorId: { in: [...connectionUserIds, req.user.id] } },
                    { visibility: 'group', groupId: { in: groupIds } },
                    { authorId: req.user.id },
                ],
            },
            include: {
                author: { select: { id: true, username: true, avatarId: true } },
                file: { select: { id: true, name: true, size: true, encrypted: true, totalChunks: true, chunkMap: true } },
                group: { select: { id: true, name: true } },
                _count: { select: { comments: true, likes: true } },
                likes: {
                    where: { userId: req.user.id },
                    select: { id: true },
                    take: 1,
                },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        });

        // Add 'liked' flag
        const postsWithLiked = posts.map((post) => ({
            ...post,
            liked: post.likes.length > 0,
            likes: undefined,
        }));

        const total = await prisma.post.count({
            where: {
                OR: [
                    { visibility: 'public' },
                    { visibility: 'connections', authorId: { in: [...connectionUserIds, req.user.id] } },
                    { visibility: 'group', groupId: { in: groupIds } },
                    { authorId: req.user.id },
                ],
            },
        });

        res.json({
            posts: postsWithLiked,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Feed error:', error);
        res.status(500).json({ error: 'Failed to load feed' });
    }
});

/**
 * GET /posts/user/:userId
 * Posts by a specific user (filtered by access)
 */
router.get('/user/:userId', authenticate, async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const skip = (page - 1) * limit;

        // Check if connected
        const isConnected = await prisma.connection.findFirst({
            where: {
                status: 'accepted',
                OR: [
                    { requesterId: req.user.id, receiverId: targetUserId },
                    { requesterId: targetUserId, receiverId: req.user.id },
                ],
            },
        });

        const isSelf = targetUserId === req.user.id;

        const visibilityFilter = isSelf
            ? {} // see all own posts
            : isConnected
                ? { visibility: { in: ['public', 'connections'] } }
                : { visibility: 'public' };

        const posts = await prisma.post.findMany({
            where: {
                authorId: targetUserId,
                ...visibilityFilter,
            },
            include: {
                author: { select: { id: true, username: true, avatarId: true } },
                file: { select: { id: true, name: true, size: true, encrypted: true } },
                _count: { select: { comments: true, likes: true } },
                likes: {
                    where: { userId: req.user.id },
                    select: { id: true },
                    take: 1,
                },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        });

        res.json({
            posts: posts.map((p) => ({ ...p, liked: p.likes.length > 0, likes: undefined })),
        });
    } catch (error) {
        console.error('User posts error:', error);
        res.status(500).json({ error: 'Failed to load user posts' });
    }
});

/**
 * GET /posts/group/:groupId
 * Posts in a specific group
 */
router.get('/group/:groupId', authenticate, async (req, res) => {
    try {
        const { groupId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const skip = (page - 1) * limit;

        // Verify membership
        const membership = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId: req.user.id } },
        });
        if (!membership) {
            return res.status(403).json({ error: 'Not a member of this group' });
        }

        const posts = await prisma.post.findMany({
            where: { groupId },
            include: {
                author: { select: { id: true, username: true, avatarId: true } },
                file: { select: { id: true, name: true, size: true, encrypted: true, totalChunks: true, chunkMap: true } },
                _count: { select: { comments: true, likes: true } },
                likes: {
                    where: { userId: req.user.id },
                    select: { id: true },
                    take: 1,
                },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        });

        res.json({
            posts: posts.map((p) => ({ ...p, liked: p.likes.length > 0, likes: undefined })),
        });
    } catch (error) {
        console.error('Group posts error:', error);
        res.status(500).json({ error: 'Failed to load group posts' });
    }
});

/**
 * DELETE /posts/:id
 * Delete own post
 */
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const post = await prisma.post.findUnique({ where: { id: req.params.id } });
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        if (post.authorId !== req.user.id) {
            return res.status(403).json({ error: 'Can only delete your own posts' });
        }

        await prisma.post.delete({ where: { id: req.params.id } });
        res.json({ message: 'Post deleted' });
    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

/**
 * POST /posts/:postId/comments
 * Add a comment to a post
 */
router.post(
    '/:postId/comments',
    authenticate,
    [body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Comment must be 1-1000 characters')],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
            if (!post) {
                return res.status(404).json({ error: 'Post not found' });
            }

            // TODO: verify user has access to view this post

            const comment = await prisma.comment.create({
                data: {
                    postId: req.params.postId,
                    authorId: req.user.id,
                    content: req.body.content,
                },
                include: {
                    author: { select: { id: true, username: true, avatarId: true } },
                },
            });

            // Real-time update
            const io = req.app.get('io');
            io.emit('newComment', { postId: req.params.postId, comment });

            res.status(201).json({ comment });
        } catch (error) {
            console.error('Create comment error:', error);
            res.status(500).json({ error: 'Failed to add comment' });
        }
    }
);

/**
 * GET /posts/:postId/comments
 * Get comments for a post (paginated)
 */
router.get('/:postId/comments', authenticate, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const skip = (page - 1) * limit;

        const comments = await prisma.comment.findMany({
            where: { postId: req.params.postId },
            include: {
                author: { select: { id: true, username: true, avatarId: true } },
            },
            orderBy: { createdAt: 'asc' },
            skip,
            take: limit,
        });

        const total = await prisma.comment.count({ where: { postId: req.params.postId } });

        res.json({ comments, pagination: { page, limit, total } });
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: 'Failed to get comments' });
    }
});

/**
 * DELETE /posts/comments/:id
 * Delete own comment
 */
router.delete('/comments/:id', authenticate, async (req, res) => {
    try {
        const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        if (comment.authorId !== req.user.id) {
            return res.status(403).json({ error: 'Can only delete your own comments' });
        }

        await prisma.comment.delete({ where: { id: req.params.id } });
        res.json({ message: 'Comment deleted' });
    } catch (error) {
        console.error('Delete comment error:', error);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

/**
 * POST /posts/:postId/like
 * Toggle like on a post
 */
router.post('/:postId/like', authenticate, async (req, res) => {
    try {
        const existingLike = await prisma.like.findUnique({
            where: {
                postId_userId: { postId: req.params.postId, userId: req.user.id },
            },
        });

        if (existingLike) {
            await prisma.like.delete({ where: { id: existingLike.id } });
            const count = await prisma.like.count({ where: { postId: req.params.postId } });
            return res.json({ liked: false, count });
        }

        await prisma.like.create({
            data: { postId: req.params.postId, userId: req.user.id },
        });

        const count = await prisma.like.count({ where: { postId: req.params.postId } });

        // Real-time update
        const io = req.app.get('io');
        io.emit('likeUpdate', { postId: req.params.postId, count });

        res.json({ liked: true, count });
    } catch (error) {
        console.error('Like error:', error);
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

export default router;
