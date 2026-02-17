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

    const getFileIcon = (name) => {
        const ext = name?.split('.').pop()?.toLowerCase() || '';
        const map = {
            image: ['jpg','jpeg','png','gif','webp','svg','bmp','ico'],
            video: ['mp4','webm','mov','avi','mkv'],
            audio: ['mp3','wav','ogg','flac','aac','m4a'],
            code: ['js','ts','jsx','tsx','py','java','cpp','c','html','css','json','xml'],
            doc: ['pdf','doc','docx','txt','md','rtf'],
            zip: ['zip','rar','7z','tar','gz'],
        };
        for (const [type, exts] of Object.entries(map)) {
            if (exts.includes(ext)) return type;
        }
        return 'file';
    };

    const fileTypeColor = (type) => {
        const colors = { image: '#6366f1', video: '#f43f5e', audio: '#f59e0b', code: '#10b981', doc: '#3b82f6', zip: '#8b5cf6', file: '#64748b' };
        return colors[type] || colors.file;
    };

    return (
        <div>
            <Navbar />
            <div className="container">
                <div className="mf-page">
                    <div className="mf-header">
                        <div className="mf-header-left">
                            <svg className="mf-header-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                            <h2 className="mf-title">My Files</h2>
                            <span className="mf-count">{files.length}</span>
                        </div>
                    </div>

                    {msg.text && <div className={`message ${msg.type}`}>{msg.text}</div>}

                    {files.length === 0 ? (
                        <div className="mf-empty">
                            <div className="mf-empty-icon">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                            </div>
                            <p>No files yet</p>
                            <span className="mf-empty-sub">Upload something to get started</span>
                            <a href="/upload" className="mf-upload-link">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                Go to Upload
                            </a>
                        </div>
                    ) : (
                        <div className="mf-list">
                            {files.map(file => {
                                const type = getFileIcon(file.name);
                                const color = fileTypeColor(type);
                                const ext = file.name?.split('.').pop()?.toUpperCase() || '';
                                return (
                                    <div key={file.id} className="mf-card">
                                        <div className="mf-file-visual" style={{ '--file-accent': color }}>
                                            <span className="mf-file-ext">{ext}</span>
                                        </div>
                                        <div className="mf-file-info">
                                            <span className="mf-file-name">{file.name}</span>
                                            <span className="mf-file-meta">
                                                {formatSize(file.size)}
                                                {file.encrypted && <span className="mf-encrypted">🔒</span>}
                                                {file.isOwner ? (
                                                    <span className="mf-badge mf-badge-owner">Owner</span>
                                                ) : (
                                                    <span className="mf-badge mf-badge-shared">Shared</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="mf-actions">
                                            <button
                                                className="mf-action-btn mf-btn-download"
                                                onClick={() => handleDownload(file)}
                                                disabled={downloading === file.id}
                                                title="Download"
                                            >
                                                {downloading === file.id ? (
                                                    <span className="download-spinner"></span>
                                                ) : (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                                )}
                                            </button>
                                            {file.isOwner && (
                                                <button
                                                    className="mf-action-btn mf-btn-share"
                                                    onClick={() => openShare(file)}
                                                    title="Share"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                                                </button>
                                            )}
                                            {file.isOwner && (
                                                <button
                                                    className="mf-action-btn mf-btn-delete"
                                                    onClick={() => handleDelete(file)}
                                                    disabled={deleting === file.id}
                                                    title="Delete"
                                                >
                                                    {deleting === file.id ? (
                                                        <span className="download-spinner"></span>
                                                    ) : (
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
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
        </div>
    );
}
