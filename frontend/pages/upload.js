import { useState, useEffect, useRef } from 'react';
import AuthGuard from '../components/AuthGuard';
import Navbar from '../components/Navbar';
import ShareDialog from '../components/ShareDialog';
import { uploadFile } from '../lib/upload';
import { storeEncryptionKey } from '../lib/chunkStore';
import { wrapAESKey } from '../lib/keyManager';
import { getAuthHeaders, getUser } from '../lib/authStore';

export default function UploadPage() {
    return (
        <AuthGuard>
            <UploadContent />
        </AuthGuard>
    );
}

function UploadContent() {
    const [selectedFile, setSelectedFile] = useState(null);
    const [progress, setProgress] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [showShare, setShowShare] = useState(false);
    const [lastUpload, setLastUpload] = useState(null); // { fileId, key }
    const fileInputRef = useRef(null);

    function handleFileChange(e) {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setMessage({ text: '', type: '' });
            setProgress(0);
            setLastUpload(null);
        }
    }

    async function handleUpload() {
        if (!selectedFile) {
            showMsg('Please select a file first', 'error');
            return;
        }
        if (selectedFile.size > 100 * 1024 * 1024) {
            showMsg('File too large. Max size is 100 MB.', 'error');
            return;
        }

        setUploading(true);
        setProgress(0);
        setMessage({ text: '', type: '' });

        try {
            const { fileId, key } = await uploadFile(selectedFile, (pct) => setProgress(pct));

            // Store encryption key locally
            await storeEncryptionKey(fileId, key);

            // Also store wrapped key for self (multi-device access)
            try {
                const user = getUser();
                const res = await fetch(`/api/keys/public/${user.id}`, {
                    headers: getAuthHeaders(),
                });
                if (res.ok) {
                    const data = await res.json();
                    const wrappedKey = await wrapAESKey(key, data.publicKey);
                    await fetch('/api/share/self', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                        body: JSON.stringify({ fileId, encryptedAESKey: wrappedKey }),
                    });
                }
            } catch (e) {
                console.error('Failed to store self key share:', e);
            }

            setLastUpload({ fileId, key });
            showMsg(`"${selectedFile.name}" encrypted & stored!`, 'success');
            setSelectedFile(null);
            setProgress(0);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
            showMsg(err.message || 'Upload failed', 'error');
            setProgress(0);
        } finally {
            setUploading(false);
        }
    }

    function showMsg(text, type) {
        setMessage({ text, type });
    }

    function formatSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function getFileIcon(name) {
        if (!name) return '📄';
        const ext = name.split('.').pop().toLowerCase();
        if (['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext)) return '🖼️';
        if (['mp4','webm','mov','avi','mkv'].includes(ext)) return '🎬';
        if (['mp3','wav','ogg','flac','aac','m4a'].includes(ext)) return '🎵';
        if (['pdf'].includes(ext)) return '📑';
        if (['zip','rar','7z','tar','gz'].includes(ext)) return '📦';
        if (['doc','docx','txt','rtf','md'].includes(ext)) return '📝';
        return '📄';
    }

    return (
        <div>
            <Navbar />
            <div className="container">
                <div className="upload-page">
                    {/* Upload area */}
                    <div
                        className={`upload-drop-zone ${uploading ? 'uploading' : ''} ${selectedFile ? 'has-file' : ''}`}
                        onClick={() => !uploading && fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                        onDragLeave={(e) => { e.currentTarget.classList.remove('drag-over'); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove('drag-over');
                            const file = e.dataTransfer.files[0];
                            if (file && !uploading) {
                                setSelectedFile(file);
                                setMessage({ text: '', type: '' });
                                setProgress(0);
                                setLastUpload(null);
                            }
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileChange}
                            disabled={uploading}
                            className="upload-file-input"
                        />

                        {uploading ? (
                            <div className="upload-progress-state">
                                <div className="upload-progress-ring">
                                    <svg viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="6" />
                                        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--primary)" strokeWidth="6"
                                            strokeDasharray={`${2 * Math.PI * 42}`}
                                            strokeDashoffset={`${2 * Math.PI * 42 * (1 - progress / 100)}`}
                                            strokeLinecap="round"
                                            transform="rotate(-90 50 50)"
                                            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                                        />
                                    </svg>
                                    <span className="upload-progress-pct">{progress}%</span>
                                </div>
                                <p className="upload-state-text">Encrypting & storing...</p>
                                <p className="upload-state-sub">{selectedFile?.name}</p>
                            </div>
                        ) : selectedFile ? (
                            <div className="upload-selected-state">
                                <div className="upload-file-preview">
                                    <span className="upload-file-emoji">{getFileIcon(selectedFile.name)}</span>
                                </div>
                                <div className="upload-file-info">
                                    <span className="upload-file-name">{selectedFile.name}</span>
                                    <span className="upload-file-size">{formatSize(selectedFile.size)}</span>
                                </div>
                                <button className="upload-change-btn" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                                    Change
                                </button>
                            </div>
                        ) : (
                            <div className="upload-empty-state">
                                <div className="upload-icon-circle">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                        <polyline points="17 8 12 3 7 8"/>
                                        <line x1="12" y1="3" x2="12" y2="15"/>
                                    </svg>
                                </div>
                                <p className="upload-drop-text">Tap to select or drag a file</p>
                                <p className="upload-drop-hint">Max 100 MB · E2E encrypted</p>
                            </div>
                        )}
                    </div>

                    {/* Encrypt button */}
                    {selectedFile && !uploading && (
                        <button className="upload-encrypt-btn" onClick={handleUpload}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0110 0v4"/>
                            </svg>
                            Encrypt & Upload
                        </button>
                    )}

                    {/* Message */}
                    {message.text && (
                        <div className={`upload-message ${message.type}`}>{message.text}</div>
                    )}

                    {/* Share after upload */}
                    {lastUpload && (
                        <div className="upload-success-actions">
                            <button className="upload-share-btn" onClick={() => setShowShare(true)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                                </svg>
                                Share This File
                            </button>
                            <button className="upload-done-btn" onClick={() => setLastUpload(null)}>
                                Done
                            </button>
                        </div>
                    )}

                    {/* Status bar */}
                    <div className="upload-status-bar">
                        <div className="upload-status-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0110 0v4"/>
                            </svg>
                            <span>AES-256-GCM</span>
                        </div>
                    </div>
                </div>

                {showShare && lastUpload && (
                    <ShareDialog
                        fileId={lastUpload.fileId}
                        aesKeyBase64={lastUpload.key}
                        onClose={() => setShowShare(false)}
                        onShared={() => {
                            showMsg('File shared successfully!', 'success');
                            setLastUpload(null);
                        }}
                    />
                )}
            </div>
        </div>
    );
}
