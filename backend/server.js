import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import { ensureDirs } from './utils/fileHelpers.js';

// Route imports
import uploadRouter from './routes/upload.js';
import mergeRouter from './routes/merge.js';
import filesRouter from './routes/files.js';
import nodesRouter from './routes/nodes.js';
import downloadRouter from './routes/download.js';

const app = express();
const PORT = 4000;

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new SocketIO(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 10 * 1024 * 1024, // 10MB max for socket messages
});

// Ensure required directories exist
ensureDirs();

// Middleware
app.use(cors());
app.use(express.json());

// Make io accessible to routes
app.set('io', io);

// Connected devices map: socketId -> { deviceId, socket }
const connectedDevices = new Map();
app.set('connectedDevices', connectedDevices);

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    function broadcastDeviceStatus() {
        const deviceIds = Array.from(connectedDevices.keys());
        io.emit('deviceStatus', {
            count: connectedDevices.size,
            deviceIds,
        });
    }

    // Device registers itself
    socket.on('register', (deviceId) => {
        connectedDevices.set(deviceId, { socketId: socket.id, socket });
        socket.deviceId = deviceId;
        console.log(`📱 Device registered: ${deviceId} (${connectedDevices.size} total)`);
        broadcastDeviceStatus();
    });

    socket.on('disconnect', () => {
        if (socket.deviceId) {
            connectedDevices.delete(socket.deviceId);
            console.log(`📴 Device disconnected: ${socket.deviceId} (${connectedDevices.size} remaining)`);
            broadcastDeviceStatus();
        }
    });
});

// Routes
app.use('/upload', uploadRouter);
app.use('/merge', mergeRouter);
app.use('/files', filesRouter);
app.use('/nodes', nodesRouter);
app.use('/download', downloadRouter);

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        connectedDevices: connectedDevices.size,
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`\n🚀 Backend server running at http://localhost:${PORT}`);
    console.log(`   WebSocket ready for device connections\n`);
});
