import { useState, useEffect } from 'react';
import AuthGuard from '../components/AuthGuard';
import Navbar from '../components/Navbar';
import ShareDialog from '../components/ShareDialog';
import { authFetch } from '../lib/authStore';
import { getEncryptionKey, assembleFileLocally } from '../lib/chunkStore';
import { useSocket } from '../lib/useSocket';

export default function MyFilesPage() {
    return (
        <AuthGuard>
            <MyFilesContent />
        </AuthGuard>
    );
}

function MyFilesContent() {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [shareTarget, setShareTarget] = useState(null); // { fileId, aesKeyBase64 }
    const [msg, setMsg] = useState({ text: '', type: '' });
    const [downloading, setDownloading] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const { connected } = useSocket(); // Register device so chunks can be retrieved

    useEffect(() => {
        loadFiles();
    }, []);

    async function loadFiles() {
        setLoading(true);
        try {
            const res = await authFetch('/api/files');
            if (res.ok) {
                const data = await res.json();
                setFiles(Array.isArray(data) ? data : data.files || []);
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }

    async function handleDownload(file) {
        setDownloading(file.id);
        try {
            // Try to get key from local store first
            const localKey = await getEncryptionKey(file.id);
            let key = localKey?.encryptionKey || null;

            // If not local, try to get wrapped key from server
            if (!key) {
                const keyRes = await authFetch(`/api/share/key/${file.id}`);
                if (keyRes.ok) {
                    const keyData = await keyRes.json();
                    if (keyData.encryptedAESKey) {
                        const { unwrapAESKey, getPrivateKey } = await import('../lib/keyManager');
                        const privKey = getPrivateKey();
                        if (privKey) {
                            key = await unwrapAESKey(keyData.encryptedAESKey, privKey);
                        }
                    } else if (keyData.publicFileKey) {
                        key = keyData.publicFileKey;
                    }
                }
            }

            if (!key) {
                setMsg({ text: 'Cannot find decryption key for this file', type: 'error' });
                setDownloading(null);
                return;
            }

            // Try local assembly first (chunks in IndexedDB)
            let encryptedData = null;
            if (file.totalChunks) {
                encryptedData = await assembleFileLocally(file.id, file.totalChunks);
                if (encryptedData) {
                    console.log('File assembled from local IndexedDB chunks');
                }
            }

            // Fall back to server download if local assembly failed
            if (!encryptedData) {
                console.log('Falling back to server download');
                const res = await authFetch(`/api/download/${file.id}`);
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Download failed');
                }
                encryptedData = await res.arrayBuffer();
            }

            const { decryptFile } = await import('../lib/crypto');
            const decrypted = await decryptFile(encryptedData, key);

            const blob = new Blob([decrypted]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            URL.revokeObjectURL(url);

            setMsg({ text: `Downloaded "${file.name}"`, type: 'success' });
        } catch (e) {
            setMsg({ text: e.message || 'Download failed', type: 'error' });
        }
        setDownloading(null);
    }

    async function handleDelete(file) {
        if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
        setDeleting(file.id);
        try {
            const res = await authFetch(`/api/files/${file.id}`, { method: 'DELETE' });
            if (res.ok) {
                setFiles(prev => prev.filter(f => f.id !== file.id));
                setMsg({ text: `Deleted "${file.name}"`, type: 'success' });
            } else {
                const err = await res.json();
                setMsg({ text: err.error || 'Delete failed', type: 'error' });
            }
        } catch (e) {
            setMsg({ text: e.message || 'Delete failed', type: 'error' });
        }
        setDeleting(null);
    }

    async function openShare(file) {
        // Get key
        const localKey = await getEncryptionKey(file.id);
        let key = localKey?.encryptionKey || null;
        if (!key) {
            try {
                const keyRes = await authFetch(`/api/share/key/${file.id}`);
                if (keyRes.ok) {
                    const keyData = await keyRes.json();
                    if (keyData.encryptedAESKey) {
                        const { unwrapAESKey, getPrivateKey } = await import('../lib/keyManager');
                        const privKey = getPrivateKey();
                        if (privKey) key = await unwrapAESKey(keyData.encryptedAESKey, privKey);
                    }
                }
            } catch (e) { console.error(e); }
        }
        if (!key) {
            setMsg({ text: 'Cannot find key for this file', type: 'error' });
            return;
        }
        setShareTarget({ fileId: file.id, aesKeyBase64: key });
    }

    const formatSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    if (loading) return (<div><Navbar /><div className="container"><div className="loading-spinner"><div className="spinner"></div></div></div></div>);

    return (
        <div>
            <Navbar />
            <div className="container">
                <h2>My Files</h2>

                {msg.text && <div className={`message ${msg.type}`}>{msg.text}</div>}

                {files.length === 0 ? (
                    <div className="empty-feed">
                        <p>No files yet. Upload something to get started!</p>
                        <a href="/upload" className="btn-primary" style={{ display: 'inline-block', textDecoration: 'none', marginTop: 12 }}>Go to Upload</a>
                    </div>
                ) : (
                    <div className="files-list">
                        {files.map(file => (
                            <div key={file.id} className="file-card">
                                <div className="file-icon">📄</div>
                                <div className="file-info">
                                    <span className="file-name">{file.name}</span>
                                    <span className="file-meta">
                                        {formatSize(file.size)} • {file.totalChunks} chunks
                                        {file.isOwner ? ' • Owned' : ' • Shared with you'}
                                    </span>
                                </div>
                                <div className="file-actions">
                                    <button
                                        className="btn-primary-sm"
                                        onClick={() => handleDownload(file)}
                                        disabled={downloading === file.id}
                                    >
                                        {downloading === file.id ? '⏳' : '⬇️'} Download
                                    </button>
                                    {file.isOwner && (
                                        <button
                                            className="btn-secondary-sm"
                                            onClick={() => openShare(file)}
                                        >
                                            📤 Share
                                        </button>
                                    )}
                                    {file.isOwner && (
                                        <button
                                            className="btn-danger-sm"
                                            onClick={() => handleDelete(file)}
                                            disabled={deleting === file.id}
                                        >
                                            {deleting === file.id ? '⏳' : '🗑️'} Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {shareTarget && (
                    <ShareDialog
                        fileId={shareTarget.fileId}
                        aesKeyBase64={shareTarget.aesKeyBase64}
                        onClose={() => setShareTarget(null)}
                        onShared={() => {
                            setMsg({ text: 'File shared!', type: 'success' });
                            setShareTarget(null);
                        }}
                    />
                )}
            </div>
        </div>
    );
}
