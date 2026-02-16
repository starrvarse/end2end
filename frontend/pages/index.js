import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { uploadFile, fetchFiles } from '../lib/upload';
import { storeChunk, getChunk, getStoredChunkCount, storeEncryptionKey, getEncryptionKey } from '../lib/chunkStore';
import { importKey, decryptData } from '../lib/crypto';

let socket = null;

export default function Home() {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(''); // fileId being downloaded
  const [message, setMessage] = useState({ text: '', type: '' });
  const [deviceCount, setDeviceCount] = useState(0);
  const [onlineDeviceIds, setOnlineDeviceIds] = useState([]);
  const [storedChunks, setStoredChunks] = useState(0);
  const [deviceId, setDeviceId] = useState('');
  const [fileKeys, setFileKeys] = useState({}); // {fileId: true} for files this device has keys for
  const fileInputRef = useRef(null);

  // Initialize socket + register device
  useEffect(() => {
    let id = localStorage.getItem('deviceId');
    if (!id) {
      id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      localStorage.setItem('deviceId', id);
    }
    setDeviceId(id);

    const host = window.location.hostname;
    socket = io(`http://${host}:4000`);

    socket.on('connect', () => {
      console.log('WebSocket connected, registering device:', id);
      socket.emit('register', id);
    });

    socket.on('deviceStatus', ({ count, deviceIds }) => {
      setDeviceCount(count);
      setOnlineDeviceIds(deviceIds);
    });

    socket.on('storeChunk', async (data, ack) => {
      try {
        console.log(`Storing encrypted chunk ${data.chunkIndex} of "${data.fileName}"`);
        await storeChunk(data.fileId, data.chunkIndex, data.data);
        updateChunkCount();
        ack({ success: true });
      } catch (err) {
        console.error('Failed to store chunk:', err);
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
      loadFiles();
    });

    loadFiles();
    updateChunkCount();

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  // Check which files this device has keys for
  useEffect(() => {
    async function checkKeys() {
      const keyMap = {};
      for (const file of files) {
        const keyEntry = await getEncryptionKey(file.id);
        if (keyEntry) keyMap[file.id] = true;
      }
      setFileKeys(keyMap);
    }
    if (files.length > 0) checkKeys();
  }, [files]);

  async function updateChunkCount() {
    try {
      const count = await getStoredChunkCount();
      setStoredChunks(count);
    } catch (e) { }
  }

  async function loadFiles() {
    try {
      const fileList = await fetchFiles();
      setFiles(fileList);
    } catch (err) {
      showMessage('Failed to load files', 'error');
    }
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setMessage({ text: '', type: '' });
      setProgress(0);
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      showMessage('Please select a file first', 'error');
      return;
    }

    if (selectedFile.size > 100 * 1024 * 1024) {
      showMessage('File too large. Max size is 100 MB.', 'error');
      return;
    }

    setUploading(true);
    setProgress(0);
    setMessage({ text: '', type: '' });

    try {
      // Upload returns the fileId and base64 encryption key
      const { fileId, key } = await uploadFile(selectedFile, (pct) => setProgress(pct));

      // Store the encryption key ONLY on this device
      await storeEncryptionKey(fileId, key);

      showMessage(
        `🔐 "${selectedFile.name}" encrypted & distributed! Only this device can decrypt it.`,
        'success'
      );
      setSelectedFile(null);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadFiles();
      updateChunkCount();
    } catch (err) {
      showMessage(err.message || 'Upload failed', 'error');
      setProgress(0);
    } finally {
      setUploading(false);
    }
  }

  /**
   * Encrypted download flow:
   * 1. Fetch encrypted file from server (server reassembles encrypted chunks from devices)
   * 2. Decrypt client-side using the stored key
   * 3. Trigger browser download of the decrypted file
   */
  async function handleDownload(file) {
    const keyEntry = await getEncryptionKey(file.id);
    if (!keyEntry) {
      showMessage('🔒 No decryption key on this device. Only the uploader can download.', 'error');
      return;
    }

    setDownloading(file.id);
    showMessage(`🔓 Downloading & decrypting "${file.name}"...`, 'success');

    try {
      const host = window.location.hostname;
      const res = await fetch(`http://${host}:4000/download/${encodeURIComponent(file.name)}`);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Download failed');
      }

      // Get the encrypted blob
      const encryptedBuffer = await res.arrayBuffer();

      // Decrypt with the stored key
      const cryptoKey = await importKey(keyEntry.encryptionKey);
      const decryptedBuffer = await decryptData(encryptedBuffer, cryptoKey);

      // Trigger browser download of the decrypted file
      const blob = new Blob([decryptedBuffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showMessage(`✅ "${file.name}" decrypted & downloaded successfully!`, 'success');
    } catch (err) {
      showMessage(err.message || 'Download failed', 'error');
    } finally {
      setDownloading('');
    }
  }

  function showMessage(text, type) {
    setMessage({ text, type });
  }

  function formatDate(isoString) {
    return new Date(isoString).toLocaleString();
  }

  return (
    <div className="container">
      <header className="header">
        <h1>🔐 Encrypted File System</h1>
        <p className="subtitle">E2E encrypted · P2P distributed · Unhackable</p>
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-dot active"></span>
            <span>{deviceCount} Device{deviceCount !== 1 ? 's' : ''} Connected</span>
          </div>
          <div className="stat-item">
            <span>💾 {storedChunks} encrypted chunk{storedChunks !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </header>

      {/* Upload Section */}
      <section className="upload-section">
        <h2>🔒 Upload & Encrypt</h2>
        <div className="upload-controls">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            disabled={uploading}
            className="file-input"
            id="file-input"
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
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}
      </section>

      {/* Files List */}
      <section className="files-section">
        <h2>Uploaded Files ({files.length})</h2>
        {files.length === 0 ? (
          <p className="empty-state">No files uploaded yet.</p>
        ) : (
          <div className="table-wrapper">
            <table className="files-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>File Name</th>
                  <th>Size</th>
                  <th>Distributed On</th>
                  <th>Upload Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, index) => {
                  const requiredDevices = file.chunkMap
                    ? [...new Set(file.chunkMap.map((c) => c.deviceId))]
                    : [];
                  const offlineDevices = requiredDevices.filter(
                    (d) => !onlineDeviceIds.includes(d)
                  );
                  const isAvailable = offlineDevices.length === 0;
                  const hasKey = !!fileKeys[file.id];
                  const isDownloading = downloading === file.id;

                  return (
                    <tr key={file.id}>
                      <td data-label="#">{index + 1}</td>
                      <td className="file-name" data-label="File Name">
                        {file.name}
                        {file.encrypted && <span className="encrypt-badge">🔐</span>}
                      </td>
                      <td data-label="Size">{file.sizeFormatted}</td>
                      <td data-label="Distributed On">
                        <span className={`node-badge ${isAvailable ? '' : 'offline'}`}>
                          {requiredDevices.length} device{requiredDevices.length !== 1 ? 's' : ''}
                          {file.totalChunks ? ` · ${file.totalChunks} chunks` : ''}
                        </span>
                      </td>
                      <td data-label="Upload Date">{formatDate(file.uploadDate)}</td>
                      <td data-label="">
                        {!isAvailable ? (
                          <div className="download-unavailable">
                            <button className="download-btn disabled" disabled>
                              ⬇ Download
                            </button>
                            <p className="offline-msg">
                              ⚠️ {offlineDevices.length} device{offlineDevices.length !== 1 ? 's' : ''} offline
                            </p>
                          </div>
                        ) : !hasKey ? (
                          <div className="download-unavailable">
                            <button className="download-btn disabled" disabled>
                              🔒 No Key
                            </button>
                            <p className="offline-msg">
                              Only the uploader can decrypt
                            </p>
                          </div>
                        ) : (
                          <button
                            className="download-btn"
                            onClick={() => handleDownload(file)}
                            disabled={isDownloading}
                          >
                            {isDownloading ? '🔓 Decrypting...' : '⬇ Download'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
