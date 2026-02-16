import { useState, useEffect, useRef } from 'react';
import AuthGuard from '../components/AuthGuard';
import Navbar from '../components/Navbar';
import ShareDialog from '../components/ShareDialog';
import { uploadFile } from '../lib/upload';
import { storeEncryptionKey } from '../lib/chunkStore';
import { wrapAESKey } from '../lib/keyManager';
import { getAuthHeaders, getUser } from '../lib/authStore';
import { useSocket } from '../lib/useSocket';

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
    const { socket, deviceCount, storedChunks } = useSocket();

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

    return (
        <div>
            <Navbar />
            <div className="container">
                <section className="upload-section">
                    <h2>Upload & Encrypt</h2>
                    <p className="section-desc">
                        Files are encrypted with AES-256-GCM in your browser before leaving your device.
                        Chunks are distributed across connected devices. The server never sees your data.
                    </p>

                    <div className="stats-bar" style={{ marginBottom: 20 }}>
                        <div className="stat-item">
                            <span className="stat-dot active"></span>
                            <span>{deviceCount} Device{deviceCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="stat-item">
                            <span>💾 {storedChunks} chunks stored</span>
                        </div>
                    </div>

                    <div className="upload-controls">
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileChange}
                            disabled={uploading}
                            className="file-input"
                        />
                        <button
                            onClick={handleUpload}
                            disabled={uploading || !selectedFile}
                            className="upload-btn"
                        >
                            {uploading ? 'Encrypting...' : '🔐 Encrypt & Upload'}
                        </button>
                    </div>

                    {selectedFile && !uploading && (
                        <p className="selected-info">
                            Selected: <strong>{selectedFile.name}</strong> ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </p>
                    )}

                    {uploading && (
                        <div className="progress-container">
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                            </div>
                            <span className="progress-text">{progress}%</span>
                        </div>
                    )}

                    {message.text && (
                        <div className={`message ${message.type}`}>{message.text}</div>
                    )}

                    {lastUpload && (
                        <div className="post-upload-actions">
                            <button
                                className="share-btn"
                                onClick={() => setShowShare(true)}
                            >
                                📤 Share This File
                            </button>
                        </div>
                    )}
                </section>

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
