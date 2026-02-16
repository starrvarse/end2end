import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken, refreshAccessToken } from './authStore';
import { storeChunk, getChunk, getStoredChunkCount } from './chunkStore';

// Singleton socket instance — persists across page transitions, never killed by component unmount
let globalSocket = null;
let globalDeviceId = null;
let listenersAttachedTo = null; // Track which socket instance has listeners

function getDeviceId() {
    if (globalDeviceId) return globalDeviceId;
    if (typeof window === 'undefined') return null;
    let id = localStorage.getItem('deviceId');
    if (!id) {
        id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        localStorage.setItem('deviceId', id);
    }
    globalDeviceId = id;
    return id;
}

function ensureSocket() {
    if (globalSocket && !globalSocket.disconnected) return globalSocket;

    const deviceId = getDeviceId();
    if (!deviceId) return null;

    const host = window.location.hostname;
    globalSocket = io(`http://${host}:4000`, {
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
    });

    globalSocket.on('connect', () => {
        const token = getAccessToken();
        if (token) {
            globalSocket.emit('authenticate', token);
        }
    });

    globalSocket.on('authenticated', () => {
        globalSocket.emit('register', deviceId);
    });

    // Handle auth failure — refresh token and retry
    globalSocket.on('authError', async () => {
        console.log('Socket auth failed, refreshing token...');
        try {
            const success = await refreshAccessToken();
            if (success) {
                const newToken = getAccessToken();
                if (newToken) {
                    globalSocket.emit('authenticate', newToken);
                }
            }
        } catch (e) {
            console.error('Socket re-auth failed:', e);
        }
    });

    // Attach chunk handlers — re-attach if this is a new socket instance
    if (listenersAttachedTo !== globalSocket) {
        globalSocket.on('storeChunk', async (data, ack) => {
            try {
                await storeChunk(data.fileId, data.chunkIndex, data.data);
                ack({ success: true });
            } catch (err) {
                ack({ success: false, error: err.message });
            }
        });

        globalSocket.on('getChunk', async (request, ack) => {
            try {
                const chunk = await getChunk(request.fileId, request.chunkIndex);
                if (chunk) {
                    ack({ data: chunk.data });
                } else {
                    ack({ data: null, error: 'Chunk not found' });
                }
            } catch (err) {
                ack({ data: null, error: err.message });
            }
        });

        listenersAttachedTo = globalSocket;
    }

    return globalSocket;
}

/**
 * Shared socket hook — ensures device is always registered.
 * Socket is NEVER disconnected on component unmount — it lives for the session.
 */
export function useSocket() {
    const [deviceCount, setDeviceCount] = useState(0);
    const [storedChunks, setStoredChunks] = useState(0);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const socket = ensureSocket();
        if (!socket) return;

        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        const onDeviceStatus = ({ count }) => setDeviceCount(count);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('deviceStatus', onDeviceStatus);

        // Set initial state
        setConnected(socket.connected);

        // Update chunk count
        getStoredChunkCount().then(c => setStoredChunks(c)).catch(() => {});

        return () => {
            // Only clean up state listeners, NEVER disconnect the socket
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('deviceStatus', onDeviceStatus);
        };
    }, []);

    return {
        socket: globalSocket,
        deviceCount,
        storedChunks,
        connected,
        deviceId: globalDeviceId,
    };
}
