import express from 'express';
import cors from 'cors';
import http from 'http';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { Server as SocketIO } from 'socket.io';
import { ensureDirs } from './utils/fileHelpers.js';
import dotenv from 'dotenv';

dotenv.config();

// Route imports
import uploadRouter from './routes/upload.js';
import mergeRouter from './routes/merge.js';
import filesRouter from './routes/files.js';
import downloadRouter from './routes/download.js';
import authRouter from './routes/auth.js';
import keysRouter from './routes/keys.js';
import connectionsRouter from './routes/connections.js';
import sharingRouter from './routes/sharing.js';
import postsRouter from './routes/posts.js';
import groupsRouter from './routes/groups.js';

const app = express();
const PORT = 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN
    ? process.env.FRONTEND_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:3000'];

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new SocketIO(server, {
    cors: { origin: FRONTEND_ORIGIN, credentials: true },
    maxHttpBufferSize: 10 * 1024 * 1024,
});

// Ensure required directories exist
ensureDirs();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Allow frontend to load resources
    crossOriginEmbedderPolicy: false,
}));

app.use(cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
}));

// Rate limiters
const generalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many attempts. Try again later.' },
});

const signupLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    message: { error: 'Too many signup attempts. Try again later.' },
});

app.use(generalLimiter);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// Make io accessible to routes
app.set('io', io);

// Connected devices map: deviceId -> { socketId, socket, userId }
const connectedDevices = new Map();
app.set('connectedDevices', connectedDevices);

// Authenticated sockets map: userId -> Set of socketIds (for notifications)
const authenticatedSockets = new Map();
app.set('authenticatedSockets', authenticatedSockets);

// Socket.IO connection handling with JWT authentication
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    function broadcastDeviceStatus() {
        const deviceIds = Array.from(connectedDevices.keys());
        io.emit('deviceStatus', {
            count: connectedDevices.size,
            deviceIds,
        });
    }

    // Authenticate socket with JWT
    socket.on('authenticate', (token) => {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.id;
            socket.username = decoded.username;

            // Track authenticated sockets per user
            if (!authenticatedSockets.has(decoded.id)) {
                authenticatedSockets.set(decoded.id, new Set());
            }
            authenticatedSockets.get(decoded.id).add(socket.id);

            socket.emit('authenticated', { userId: decoded.id });
            console.log(`Socket authenticated: ${decoded.username} (${socket.id})`);
        } catch (err) {
            socket.emit('authError', { error: 'Invalid token' });
        }
    });

    // Device registers itself (requires authentication)
    socket.on('register', (deviceId) => {
        if (!socket.userId) {
            socket.emit('authError', { error: 'Must authenticate before registering' });
            return;
        }

        connectedDevices.set(deviceId, {
            socketId: socket.id,
            socket,
            userId: socket.userId,
        });
        socket.deviceId = deviceId;
        console.log(`Device registered: ${deviceId} by ${socket.username} (${connectedDevices.size} total)`);
        broadcastDeviceStatus();
    });

    socket.on('disconnect', () => {
        if (socket.deviceId) {
            connectedDevices.delete(socket.deviceId);
            console.log(`Device disconnected: ${socket.deviceId} (${connectedDevices.size} remaining)`);
            broadcastDeviceStatus();
        }

        // Clean up authenticated sockets
        if (socket.userId && authenticatedSockets.has(socket.userId)) {
            authenticatedSockets.get(socket.userId).delete(socket.id);
            if (authenticatedSockets.get(socket.userId).size === 0) {
                authenticatedSockets.delete(socket.userId);
            }
        }
    });
});

// Routes
app.use('/auth', authLimiter, authRouter);
app.use('/upload', uploadRouter);
app.use('/merge', mergeRouter);
app.use('/files', filesRouter);
app.use('/download', downloadRouter);
app.use('/keys', keysRouter);
app.use('/connections', connectionsRouter);
app.use('/share', sharingRouter);
app.use('/posts', postsRouter);
app.use('/groups', groupsRouter);

// Override auth limiter for non-login auth routes
app.use('/auth/signup', signupLimiter);

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        connectedDevices: connectedDevices.size,
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`\nBackend server running at http://localhost:${PORT}`);
    console.log(`WebSocket ready for device connections`);
    console.log(`CORS origin: ${FRONTEND_ORIGIN}\n`);
});
