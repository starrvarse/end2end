import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma.js';
import {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    authenticate,
} from '../middleware/auth.js';

const router = Router();

const BCRYPT_ROUNDS = 12;

// Validation rules
const signupValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 20 })
        .withMessage('Username must be 3-20 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain uppercase, lowercase, and a number'),
    body('avatarId')
        .isInt({ min: 0, max: 11 })
        .withMessage('Avatar ID must be 0-11'),
];

const loginValidation = [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
];

/**
 * POST /auth/signup
 * Create a new user account
 */
router.post('/signup', signupValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password, avatarId } = req.body;

        // Check if username exists
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Create user
        const user = await prisma.user.create({
            data: {
                username,
                passwordHash,
                avatarId: parseInt(avatarId, 10),
            },
        });

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Store refresh token
        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        // Set refresh token as HTTP-only cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/',
        });

        res.status(201).json({
            user: {
                id: user.id,
                username: user.username,
                avatarId: user.avatarId,
            },
            accessToken,
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

/**
 * POST /auth/login
 * Authenticate a user and return tokens + encrypted private key
 */
router.post('/login', loginValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password } = req.body;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Store refresh token
        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        // Set refresh token as HTTP-only cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });

        res.json({
            user: {
                id: user.id,
                username: user.username,
                avatarId: user.avatarId,
            },
            accessToken,
            // Return encrypted private key so client can decrypt it with password
            encryptedPrivateKey: user.encryptedPrivateKey,
            pbkdfSalt: user.pbkdfSalt,
            publicKey: user.publicKey,
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /auth/refresh
 * Use refresh token cookie to get a new access token
 */
router.post('/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ error: 'No refresh token' });
        }

        // Verify the refresh token
        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        } catch {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        // Check if token exists in DB (not revoked)
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
        });

        if (!storedToken || storedToken.expiresAt < new Date()) {
            return res.status(401).json({ error: 'Refresh token expired or revoked' });
        }

        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Generate new access token
        const accessToken = generateAccessToken(user);

        res.json({
            accessToken,
            user: {
                id: user.id,
                username: user.username,
                avatarId: user.avatarId,
            },
        });
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

/**
 * POST /auth/logout
 * Clear refresh token cookie and revoke from DB
 */
router.post('/logout', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;

        if (refreshToken) {
            await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
        }

        res.clearCookie('refreshToken', { path: '/' });
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

/**
 * GET /auth/me
 * Return current user profile
 */
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                username: true,
                avatarId: true,
                publicKey: true,
                createdAt: true,
            },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Me error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

export default router;
