import { useState, useEffect, useMemo } from 'react';
import { getUser, authFetch } from '../lib/authStore';
import { importKey, decryptData } from '../lib/crypto';
import { getEncryptionKey, storeEncryptionKey, assembleFileLocally } from '../lib/chunkStore';
import { unwrapAESKey, hasPrivateKey } from '../lib/keyManager';

const avatarEmojis = ['🦊', '🐺', '🦁', '🐯', '🦅', '🐉', '🦈', '🐙', '🦇', '🐸', '🦉', '🐲'];

// File type detection for preview
function getFileType(fileName) {
    if (!fileName) return 'file';
    const ext = fileName.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
    if (['doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) return 'document';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'spreadsheet';
    if (['ppt', 'pptx'].includes(ext)) return 'presentation';
    if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json', 'xml'].includes(ext)) return 'code';
    return 'file';
}

function getFileIcon(type) {
    const icons = {
        image: '🖼️', video: '🎬', audio: '🎵', pdf: '📑',
        archive: '📦', document: '📝', spreadsheet: '📊',
        presentation: '📽️', code: '💻', file: '📄',
    };
    return icons[type] || '📄';
}

function getFileColor(type) {
    const colors = {
        image: '#8b5cf6', video: '#ec4899', audio: '#f59e0b',
        pdf: '#ef4444', archive: '#6366f1', document: '#3b82f6',
        spreadsheet: '#22c55e', presentation: '#f97316', code: '#06b6d4',
        file: '#64748b',
    };
    return colors[type] || '#64748b';
}

export default function PostCard({ post, onLike, onComment }) {
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [videoPlaying, setVideoPlaying] = useState(false);

    const user = getUser();
    const isOwn = user?.id === post.author?.id;
    const fileType = useMemo(() => getFileType(post.file?.name), [post.file?.name]);
    const isPreviewable = ['image', 'video', 'audio'].includes(fileType);

    // Auto-generate preview for media files
    useEffect(() => {
        if (isPreviewable && post.file) {
            generatePreview();
        }
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [post.file?.id]);

    function getMimeType(fileName, type) {
        const ext = fileName.split('.').pop().toLowerCase();
        const mimeMap = {
            // images
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
            // videos
            mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
            avi: 'video/x-msvideo', mkv: 'video/x-matroska',
            // audio
            mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
            flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4',
        };
        const fallbacks = { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/mpeg' };
        return mimeMap[ext] || fallbacks[type] || 'application/octet-stream';
    }

    async function generatePreview() {
        if (previewLoading || previewUrl) return;
        setPreviewLoading(true);
        try {
            let result = await resolveFileKey(post.file.id);

            if (!result || (typeof result === 'object' && result.error)) { setPreviewLoading(false); return; }
            let aesKeyBase64 = result;
            await storeEncryptionKey(post.file.id, aesKeyBase64);

            let encryptedBuffer = null;
            if (post.file.totalChunks) {
                encryptedBuffer = await assembleFileLocally(post.file.id, post.file.totalChunks);
            }

            // Fallback: fetch from server if not in local IndexedDB (e.g. viewing on different device)
            if (!encryptedBuffer) {
                try {
                    const res = await authFetch(`/api/download/${post.file.id}`);
                    if (res.ok) {
                        encryptedBuffer = await res.arrayBuffer();
                    }
                } catch (dlErr) {
                    console.log('Server download for preview failed:', dlErr.message);
                }
            }

            if (!encryptedBuffer) { setPreviewLoading(false); return; }

            const cryptoKey = await importKey(aesKeyBase64);
            const decrypted = await decryptData(encryptedBuffer, cryptoKey);
            const mime = getMimeType(post.file.name, fileType);
            const blob = new Blob([decrypted], { type: mime });
            setPreviewUrl(URL.createObjectURL(blob));
        } catch (e) {
            console.log('Preview generation skipped:', e.message);
        }
        setPreviewLoading(false);
    }

    function handleVideoPlay(e) {
        const video = e.target.closest('.post-video-container')?.querySelector('video');
        if (video) {
            video.play();
            setVideoPlaying(true);
        }
    }

    async function loadComments() {
        if (loadingComments) return;
        setLoadingComments(true);
        try {
            const res = await authFetch(`/api/posts/${post.id}/comments`);
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
            const res = await authFetch(`/api/posts/${post.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

    /**
     * Resolve the AES decryption key for a file:
     * 1. Try local IndexedDB
     * 2. Fetch from server (uses authFetch for auto token refresh)
     * 3. Unwrap with private key or use public key
     */
    async function resolveFileKey(fileId) {
        // 1. Local key
        const localKey = await getEncryptionKey(fileId);
        if (localKey) return localKey.encryptionKey;

        // 2. Server key share
        try {
            const keyRes = await authFetch(`/api/share/key/${fileId}`);
            if (keyRes.ok) {
                const keyData = await keyRes.json();
                if (keyData.isPublic && keyData.publicFileKey) return keyData.publicFileKey;
                if (keyData.encryptedAESKey) {
                    if (!hasPrivateKey()) {
                        console.warn('Encrypted key available but private key not loaded. Re-login may be needed.');
                        return { error: 'private_key_missing' };
                    }
                    const unwrapped = await unwrapAESKey(keyData.encryptedAESKey);
                    return unwrapped;
                }
            } else if (keyRes.status === 403) {
                const errData = await keyRes.json().catch(() => ({}));
                if (errData.needsReShare) {
                    console.warn(`File ${fileId} needs re-share from owner ${errData.ownerId} in group ${errData.groupId}`);
                    return { error: 'needs_reshare', ownerId: errData.ownerId, groupId: errData.groupId };
                }
            }
        } catch (e) {
            console.error('Key fetch error:', e);
        }

        return { error: 'no_key' };
    }

    async function handleDownload() {
        if (!post.file || downloading) return;
        setDownloading(true);

        try {
            let result = await resolveFileKey(post.file.id);

            if (result && typeof result === 'object' && result.error) {
                if (result.error === 'private_key_missing') {
                    alert('Encryption keys not loaded. Please log out and log back in to unlock decryption.');
                } else if (result.error === 'needs_reshare') {
                    alert('The file encryption key has not been shared with you yet. The file owner needs to re-share this file in the group.');
                } else {
                    alert('No decryption key available. The file owner may need to re-share it with you.');
                }
                return;
            }

            let aesKeyBase64 = result;
            if (!aesKeyBase64) {
                alert('No decryption key available.');
                return;
            }

            await storeEncryptionKey(post.file.id, aesKeyBase64);

            let encryptedBuffer = null;
            if (post.file.totalChunks) {
                encryptedBuffer = await assembleFileLocally(post.file.id, post.file.totalChunks);
            }

            if (!encryptedBuffer) {
                const res = await authFetch(`/api/download/${post.file.id}`);
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Download failed');
                }
                encryptedBuffer = await res.arrayBuffer();
            }

            const cryptoKey = await importKey(aesKeyBase64);
            const decryptedBuffer = await decryptData(encryptedBuffer, cryptoKey);

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
                alert('File data unavailable. The owner may need to re-upload it.');
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
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function formatSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    const fileColor = getFileColor(fileType);

    return (
        <article className="post-card">
            {/* Header */}
            <div className="post-header">
                <div className="post-author">
                    <div className="post-avatar">{avatarEmojis[post.author?.avatarId] || '👤'}</div>
                    <div className="post-author-info">
                        <span className="post-author-name">{post.author?.username}</span>
                        <span className="post-time">{timeAgo(post.createdAt)}</span>
                    </div>
                </div>
                <span className={`post-visibility-badge ${post.visibility}`}>
                    {post.visibility === 'public' ? '🌐' : post.visibility === 'connections' ? '🔗' : '👥'}
                </span>
            </div>

            {/* Caption */}
            {post.caption && <p className="post-caption">{post.caption}</p>}

            {/* Media Preview / File Attachment */}
            {post.file && (
                <div className="post-media">
                    {/* Image preview */}
                    {fileType === 'image' && previewUrl ? (
                        <div className="post-image-container">
                            <img src={previewUrl} alt={post.file.name} className="post-image" />
                            <div className="post-image-overlay">
                                <button className="post-image-download" onClick={handleDownload} disabled={downloading}>
                                    {downloading ? '⏳' : '⬇'} Download
                                </button>
                            </div>
                        </div>

                    /* Video preview */
                    ) : fileType === 'video' && previewUrl ? (
                        <div className="post-video-container">
                            <video
                                src={previewUrl}
                                className="post-video"
                                controls={videoPlaying}
                                preload="metadata"
                                playsInline
                                onPause={() => setVideoPlaying(false)}
                                onPlay={() => setVideoPlaying(true)}
                                onEnded={() => setVideoPlaying(false)}
                            />
                            {!videoPlaying && (
                                <div className="post-video-overlay" onClick={handleVideoPlay}>
                                    <div className="play-button">
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                                            <path d="M8 5v14l11-7z"/>
                                        </svg>
                                    </div>
                                    <div className="video-meta">
                                        <span className="video-duration">{post.file.name.split('.').pop().toUpperCase()}</span>
                                        <span className="video-size">{formatSize(post.file.size)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                    /* Audio preview */
                    ) : fileType === 'audio' && previewUrl ? (
                        <div className="post-audio-container">
                            <div className="post-audio-visual">
                                <div className="audio-waveform">
                                    <span></span><span></span><span></span><span></span><span></span>
                                    <span></span><span></span><span></span><span></span><span></span>
                                </div>
                                <div className="audio-info">
                                    <span className="audio-size">{formatSize(post.file.size)} · 🔒 E2E Encrypted</span>
                                </div>
                            </div>
                            <audio src={previewUrl} controls className="post-audio" preload="metadata" />
                        </div>

                    /* Loading shimmer for any media type */
                    ) : isPreviewable && previewLoading ? (
                        <div className="post-preview-placeholder" data-type={fileType}>
                            <div className="preview-loading">
                                <div className="preview-shimmer"></div>
                                <span>Decrypting {fileType}...</span>
                            </div>
                        </div>
                    ) : (
                        /* File card for non-previewable or unavailable preview */
                        <div className="post-file-card" style={{ '--file-accent': fileColor }}>
                            <div className="post-file-visual">
                                <span className="post-file-icon">{getFileIcon(fileType)}</span>
                                <div className="post-file-ext">{post.file.name.split('.').pop().toUpperCase()}</div>
                            </div>
                            <div className="post-file-details">
                                <span className="post-file-meta">
                                    {formatSize(post.file.size)} {post.file.encrypted ? '· 🔒 E2E Encrypted' : ''}
                                </span>
                            </div>
                            <button
                                className="post-file-download"
                                onClick={handleDownload}
                                disabled={downloading}
                            >
                                {downloading ? (
                                    <span className="download-spinner"></span>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                        <polyline points="7 10 12 15 17 10"/>
                                        <line x1="12" y1="15" x2="12" y2="3"/>
                                    </svg>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="post-actions">
                <button
                    className={`action-btn ${post.liked ? 'liked' : ''}`}
                    onClick={() => onLike?.(post.id)}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={post.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                    </svg>
                    <span>{post._count?.likes || 0}</span>
                </button>
                <button className="action-btn" onClick={toggleComments}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                    <span>{post._count?.comments || 0}</span>
                </button>
                {post.file && (
                    <button className="action-btn" onClick={handleDownload} disabled={downloading}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        <span>Save</span>
                    </button>
                )}
            </div>

            {/* Comments */}
            {showComments && (
                <div className="comments-section">
                    {loadingComments ? (
                        <div className="comments-loading">Loading...</div>
                    ) : (
                        <>
                            {comments.length === 0 && (
                                <p className="comments-empty">No comments yet</p>
                            )}
                            {comments.map((comment) => (
                                <div key={comment.id} className="comment">
                                    <div className="comment-avatar">
                                        {avatarEmojis[comment.author?.avatarId] || '👤'}
                                    </div>
                                    <div className="comment-body">
                                        <div className="comment-header">
                                            <span className="comment-author">{comment.author?.username}</span>
                                            <span className="comment-time">{timeAgo(comment.createdAt)}</span>
                                        </div>
                                        <p className="comment-text">{comment.content}</p>
                                    </div>
                                </div>
                            ))}
                            <form className="comment-form" onSubmit={handleComment}>
                                <input
                                    type="text"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Add a comment..."
                                    maxLength={1000}
                                    disabled={commentSubmitting}
                                    className="comment-input"
                                />
                                <button type="submit" disabled={!newComment.trim() || commentSubmitting} className="comment-submit">
                                    ↑
                                </button>
                            </form>
                        </>
                    )}
                </div>
            )}
        </article>
    );
}
