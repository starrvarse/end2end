import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /keys/register
 * Store user's RSA public key and encrypted private key (after signup key generation).
 */
router.post(
    '/register',
    authenticate,
    [
        body('publicKey').notEmpty().withMessage('Public key is required'),
        body('encryptedPrivateKey').notEmpty().withMessage('Encrypted private key is required'),
        body('pbkdfSalt').notEmpty().withMessage('PBKDF salt is required'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { publicKey, encryptedPrivateKey, pbkdfSalt } = req.body;

            await prisma.user.update({
                where: { id: req.user.id },
                data: { publicKey, encryptedPrivateKey, pbkdfSalt },
            });

            res.json({ message: 'Keys registered successfully' });
        } catch (error) {
            console.error('Key registration error:', error);
            res.status(500).json({ error: 'Failed to register keys' });
        }
    }
);

/**
 * GET /keys/public/:userId
 * Return a user's public key for key wrapping.
 */
router.get('/public/:userId', authenticate, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.userId },
            select: { id: true, username: true, publicKey: true },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.publicKey) {
            return res.status(404).json({ error: 'User has no public key registered' });
        }

        res.json({ userId: user.id, username: user.username, publicKey: user.publicKey });
    } catch (error) {
        console.error('Get public key error:', error);
        res.status(500).json({ error: 'Failed to get public key' });
    }
});

/**
 * GET /keys/public-batch
 * Return public keys for multiple users. Used when sharing with groups.
 * Query: ?userIds=id1,id2,id3
 */
router.get('/public-batch', authenticate, async (req, res) => {
    try {
        const { userIds } = req.query;
        if (!userIds) {
            return res.status(400).json({ error: 'userIds query parameter required' });
        }

        const ids = userIds.split(',').filter(Boolean);
        const users = await prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, username: true, publicKey: true },
        });

        res.json({ keys: users.filter((u) => u.publicKey) });
    } catch (error) {
        console.error('Batch public key error:', error);
        res.status(500).json({ error: 'Failed to get public keys' });
    }
});

export default router;
