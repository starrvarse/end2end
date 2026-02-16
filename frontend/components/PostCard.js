import { useState, useEffect } from 'react';
import { getAuthHeaders, getUser } from '../lib/authStore';
import { importKey, decryptData } from '../lib/crypto';
import { getEncryptionKey, storeEncryptionKey, assembleFileLocally } from '../lib/chunkStore';
import { unwrapAESKey, hasPrivateKey } from '../lib/keyManager';

const avatarEmojis = ['🦊', '🐺', '🦁', '🐯', '🦅', '🐉', '🦈', '🐙', '🦇', '🐸', '🦉', '🐲'];

export default function PostCard({ post, onLike, onComment }) {
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [commentSubmitting, setCommentSubmitting] = useState(false);

    const user = getUser();
    const isOwn = user?.id === post.author?.id;

    async function loadComments() {
        if (loadingComments) return;
        setLoadingComments(true);
        try {
            const res = await fetch(`/api/posts/${post.id}/comments`, {
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                setComments(data.comments);
            }
        } catch (e) {
            console.error('Failed to load comments:', e);
        } finally {
            setLoadingComments(false);
        }
    }

    async function handleComment(e) {
        e.preventDefault();
        if (!newComment.trim() || commentSubmitting) return;
        setCommentSubmitting(true);
        try {
            const res = await fetch(`/api/posts/${post.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ content: newComment.trim() }),
            });
            if (res.ok) {
                const data = await res.json();
                setComments((prev) => [...prev, data.comment]);
                setNewComment('');
                onComment?.();
            }
        } catch (e) {
            console.error('Failed to post comment:', e);
        } finally {
            setCommentSubmitting(false);
        }
    }

    async function handleDownload() {
        if (!post.file || downloading) return;
        setDownloading(true);

        try {
            let aesKeyBase64 = null;

            // 1. Check local IndexedDB cache
            const localKey = await getEncryptionKey(post.file.id);
            if (localKey) {
                aesKeyBase64 = localKey.encryptionKey;
            }

            // 2. Try to get wrapped key from server
            if (!aesKeyBase64) {
                const keyRes = await fetch(`/api/share/key/${post.file.id}`, {
                    headers: getAuthHeaders(),
                });

                if (keyRes.ok) {
                    const keyData = await keyRes.json();

                    if (keyData.isPublic && keyData.publicFileKey) {
                        // Public file — AES key is in plaintext
                        aesKeyBase64 = keyData.publicFileKey;
                    } else if (keyData.encryptedAESKey && hasPrivateKey()) {
                        // Unwrap with private key
                        aesKeyBase64 = await unwrapAESKey(keyData.encryptedAESKey);
                    }
                }
            }

            if (!aesKeyBase64) {
                alert('No decryption key available. You need access to this file.');
                return;
            }

            // Cache key locally
            await storeEncryptionKey(post.file.id, aesKeyBase64);

            // Try local assembly first (chunks in IndexedDB)
            let encryptedBuffer = null;
            if (post.file.totalChunks) {
                encryptedBuffer = await assembleFileLocally(post.file.id, post.file.totalChunks);
                if (encryptedBuffer) {
                    console.log('File assembled from local IndexedDB chunks');
                }
            }

            // Fall back to server download if local assembly failed
            if (!encryptedBuffer) {
                console.log('Falling back to server download');
                const res = await fetch(`/api/download/${post.file.id}`, {
                    headers: getAuthHeaders(),
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Download failed');
                }

                encryptedBuffer = await res.arrayBuffer();
            }

            const cryptoKey = await importKey(aesKeyBase64);
            const decryptedBuffer = await decryptData(encryptedBuffer, cryptoKey);

            // Trigger download
            const blob = new Blob([decryptedBuffer]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = post.file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Download failed:', e);
            const msg = e.message || 'Download failed';
            if (msg.includes('Chunk not found') || msg.includes('Timeout') || msg.includes('offline')) {
                alert('File data unavailable. The file chunks are no longer accessible on any device. The owner may need to re-upload it.');
            } else {
                alert(msg);
            }
        } finally {
            setDownloading(false);
        }
    }

    function toggleComments() {
        if (!showComments) loadComments();
        setShowComments(!showComments);
    }

    function timeAgo(dateStr) {
        const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    function formatSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    return (
        <div className="post-card">
            <div className="post-header">
                <div className="post-author">
                    <span className="post-avatar">{avatarEmojis[post.author?.avatarId] || '👤'}</span>
                    <div>
                        <span className="post-username">{post.author?.username}</span>
                        <span className="post-time">{timeAgo(post.createdAt)}</span>
                    </div>
                </div>
                <span className={`visibility-badge ${post.visibility}`}>
                    {post.visibility === 'public' ? '🌐' : post.visibility === 'connections' ? '🔗' : '👥'}
                    {post.visibility}
                </span>
            </div>

            {post.caption && <p className="post-caption">{post.caption}</p>}

            {post.file && (
                <div className="post-file">
                    <div className="file-info">
                        <span className="file-icon">📄</span>
                        <div>
                            <span className="file-name">{post.file.name}</span>
                            <span className="file-size">{formatSize(post.file.size)} · {post.file.encrypted ? '🔐 Encrypted' : 'Unencrypted'}</span>
                        </div>
                    </div>
                    <button
                        className="download-btn"
                        onClick={handleDownload}
                        disabled={downloading}
                    >
                        {downloading ? 'Decrypting...' : '⬇ Download'}
                    </button>
                </div>
            )}

            <div className="post-actions">
                <button
                    className={`action-btn ${post.liked ? 'liked' : ''}`}
                    onClick={() => onLike?.(post.id)}
                >
                    {post.liked ? '❤️' : '🤍'} {post._count?.likes || 0}
                </button>
                <button className="action-btn" onClick={toggleComments}>
                    💬 {post._count?.comments || 0}
                </button>
            </div>

            {showComments && (
                <div className="comments-section">
                    {loadingComments ? (
                        <p className="comments-loading">Loading comments...</p>
                    ) : (
                        <>
                            {comments.map((comment) => (
                                <div key={comment.id} className="comment">
                                    <span className="comment-avatar">
                                        {avatarEmojis[comment.author?.avatarId] || '👤'}
                                    </span>
                                    <div className="comment-body">
                                        <span className="comment-author">{comment.author?.username}</span>
                                        <span className="comment-text">{comment.content}</span>
                                        <span className="comment-time">{timeAgo(comment.createdAt)}</span>
                                    </div>
                                </div>
                            ))}
                            <form className="comment-form" onSubmit={handleComment}>
                                <input
                                    type="text"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Write a comment..."
                                    maxLength={1000}
                                    disabled={commentSubmitting}
                                />
                                <button type="submit" disabled={!newComment.trim() || commentSubmitting}>
                                    Send
                                </button>
                            </form>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
