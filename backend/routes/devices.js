import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import {
    FILES_JSON,
    NODES_JSON,
    STORAGE_DIR,
    readJSON,
    writeJSON,
} from '../utils/fileHelpers.js';

const router = Router();

// In-memory store of connected devices
const connectedDevices = new Map();
const TIMEOUT_MS = 15_000;

function cleanStale() {
    const now = Date.now();
    for (const [id, device] of connectedDevices) {
        if (now - device.lastSeen > TIMEOUT_MS) {
            connectedDevices.delete(id);
        }
    }
}

/**
 * Auto-register device as a node and redistribute ALL file chunks
 */
function autoRegisterAndRedistribute(deviceId) {
    const nodesData = readJSON(NODES_JSON) || { nodes: [], assignments: {} };

    // Already registered? Skip.
    if (nodesData.nodes.some((n) => n.name === deviceId)) {
        return false;
    }

    // Register new node
    nodesData.nodes.push({
        name: deviceId,
        joinedAt: new Date().toISOString(),
    });

    // Create device storage folder
    const nodeDir = path.join(STORAGE_DIR, deviceId);
    if (!fs.existsSync(nodeDir)) {
        fs.mkdirSync(nodeDir, { recursive: true });
    }

    // Save nodes first
    writeJSON(NODES_JSON, nodesData);

    // --- Redistribute ALL chunks of ALL files across ALL nodes ---
    const files = readJSON(FILES_JSON) || [];
    const nodes = nodesData.nodes;

    if (nodes.length === 0 || files.length === 0) {
        console.log(`✅ Device "${deviceId}" registered. No files to redistribute.`);
        return true;
    }

    for (const file of files) {
        if (!file.chunkMap || file.chunkMap.length === 0) continue;

        const newChunkMap = [];

        for (let i = 0; i < file.totalChunks; i++) {
            const oldChunk = file.chunkMap.find((c) => c.chunkIndex === i);
            const oldNode = oldChunk ? oldChunk.node : 'unassigned';
            const newNode = nodes[i % nodes.length].name;

            const chunkFileName = `${file.id}_chunk_${i}`;
            const oldPath = path.join(STORAGE_DIR, oldNode, chunkFileName);
            const newDir = path.join(STORAGE_DIR, newNode);
            const newPath = path.join(newDir, chunkFileName);

            // Move chunk if it changed devices
            if (newNode !== oldNode && fs.existsSync(oldPath)) {
                if (!fs.existsSync(newDir)) {
                    fs.mkdirSync(newDir, { recursive: true });
                }
                fs.renameSync(oldPath, newPath);
                console.log(`   📦 ${file.name} chunk ${i}: ${oldNode} → ${newNode}`);
            }

            newChunkMap.push({ chunkIndex: i, node: newNode });
        }

        file.chunkMap = newChunkMap;
    }

    // Clean up empty folders
    const unassignedDir = path.join(STORAGE_DIR, 'unassigned');
    if (fs.existsSync(unassignedDir)) {
        const remaining = fs.readdirSync(unassignedDir);
        if (remaining.length === 0) fs.rmdirSync(unassignedDir);
    }

    writeJSON(FILES_JSON, files);
    console.log(`✅ Device "${deviceId}" registered. Chunks redistributed across ${nodes.length} device(s).`);
    return true;
}

/**
 * POST /devices/heartbeat
 */
router.post('/heartbeat', (req, res) => {
    try {
        const { deviceId } = req.body;

        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId is required' });
        }

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const isNew = !connectedDevices.has(deviceId);

        connectedDevices.set(deviceId, {
            ip,
            userAgent,
            lastSeen: Date.now(),
        });

        if (isNew) {
            autoRegisterAndRedistribute(deviceId);
        }

        cleanStale();

        res.json({
            message: isNew ? 'Device registered & chunks redistributed' : 'Heartbeat received',
            activeDevices: connectedDevices.size,
        });
    } catch (error) {
        console.error('Heartbeat error:', error);
        res.status(500).json({ error: 'Heartbeat failed' });
    }
});

/**
 * GET /devices
 */
router.get('/', (req, res) => {
    cleanStale();

    const devices = [];
    for (const [id, device] of connectedDevices) {
        devices.push({
            deviceId: id,
            ip: device.ip,
            lastSeen: new Date(device.lastSeen).toISOString(),
        });
    }

    res.json({ count: devices.length, devices });
});

export default router;
