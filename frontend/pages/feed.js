import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import AuthGuard from '../components/AuthGuard';
import Navbar from '../components/Navbar';
import PostCard from '../components/PostCard';
import { getAuthHeaders, getAccessToken, getUser } from '../lib/authStore';
import { storeChunk, getChunk, getStoredChunkCount } from '../lib/chunkStore';

let socket = null;

export default function FeedPage() {
    return (
        <AuthGuard>
            <FeedContent />
        </AuthGuard>
    );
}

function FeedContent() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [deviceCount, setDeviceCount] = useState(0);
    const [storedChunks, setStoredChunks] = useState(0);
    const [pendingCount, setPendingCount] = useState(0);
    const [deviceId, setDeviceId] = useState('');

    // Initialize socket connection
    useEffect(() => {
        let id = localStorage.getItem('deviceId');
        if (!id) {
            id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            localStorage.setItem('deviceId', id);
        }
        setDeviceId(id);

        const host = window.location.hostname;
        socket = io(`http://${host}:4000`, { withCredentials: true });

        socket.on('connect', () => {
            // Authenticate socket with JWT
            const token = getAccessToken();
            if (token) {
                socket.emit('authenticate', token);
            }
        });

        socket.on('authenticated', () => {
            socket.emit('register', id);
        });

        socket.on('deviceStatus', ({ count }) => {
            setDeviceCount(count);
        });

        socket.on('storeChunk', async (data, ack) => {
            try {
                await storeChunk(data.fileId, data.chunkIndex, data.data);
                updateChunkCount();
                ack({ success: true });
            } catch (err) {
                ack({ success: false, error: err.message });
            }
        });

        socket.on('getChunk', async (request, ack) => {
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

        socket.on('filesUpdated', () => {
            loadPosts(1, true);
        });

        socket.on('newPost', () => {
            loadPosts(1, true);
        });

        socket.on('connectionRequest', () => {
            loadPendingCount();
        });

        loadPosts(1, true);
        updateChunkCount();
        loadPendingCount();

        return () => {
            if (socket) socket.disconnect();
        };
    }, []);

    async function updateChunkCount() {
        try {
            const count = await getStoredChunkCount();
            setStoredChunks(count);
        } catch { }
    }

    async function loadPendingCount() {
        try {
            const res = await fetch('/api/connections/pending', {
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                setPendingCount(data.requests?.length || 0);
            }
        } catch { }
    }

    async function loadPosts(pageNum = 1, reset = false) {
        try {
            setLoading(true);
            const res = await fetch(`/api/posts/feed?page=${pageNum}&limit=20`, {
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                if (reset) {
                    setPosts(data.posts);
                } else {
                    setPosts((prev) => [...prev, ...data.posts]);
                }
                setHasMore(data.pagination.page < data.pagination.totalPages);
                setPage(pageNum);
            }
        } catch (e) {
            console.error('Failed to load feed:', e);
        } finally {
            setLoading(false);
        }
    }

    async function handleLike(postId) {
        try {
            const res = await fetch(`/api/posts/${postId}/like`, {
                method: 'POST',
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                setPosts((prev) =>
                    prev.map((p) =>
                        p.id === postId
                            ? { ...p, liked: data.liked, _count: { ...p._count, likes: data.count } }
                            : p
                    )
                );
            }
        } catch (e) {
            console.error('Like failed:', e);
        }
    }

    function handleCommentAdded() {
        // Refresh posts to update comment count
        loadPosts(1, true);
    }

    return (
        <div>
            <Navbar pendingCount={pendingCount} />
            <div className="container">
                <div className="feed-header">
                    <h2>Feed</h2>
                    <div className="stats-bar">
                        <div className="stat-item">
                            <span className="stat-dot active"></span>
                            <span>{deviceCount} Device{deviceCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="stat-item">
                            <span>💾 {storedChunks} chunks</span>
                        </div>
                    </div>
                </div>

                {posts.length === 0 && !loading ? (
                    <div className="empty-feed">
                        <h3>Your feed is empty</h3>
                        <p>Upload files, connect with others, and share to see posts here.</p>
                    </div>
                ) : (
                    <div className="posts-list">
                        {posts.map((post) => (
                            <PostCard
                                key={post.id}
                                post={post}
                                onLike={handleLike}
                                onComment={handleCommentAdded}
                            />
                        ))}
                    </div>
                )}

                {loading && <div className="loading-spinner"><div className="spinner"></div></div>}

                {hasMore && !loading && posts.length > 0 && (
                    <button className="load-more" onClick={() => loadPosts(page + 1)}>
                        Load More
                    </button>
                )}
            </div>
        </div>
    );
}
