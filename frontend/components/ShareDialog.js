import { useState } from 'react';
import { getAuthHeaders, getUser } from '../lib/authStore';
import { exportKey, generateKey } from '../lib/crypto';
import { wrapAESKey } from '../lib/keyManager';

/**
 * ShareDialog modal for sharing a file with connections, groups, or publicly.
 */
export default function ShareDialog({ fileId, aesKeyBase64, onClose, onShared }) {
    const [visibility, setVisibility] = useState('connections');
    const [caption, setCaption] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [groups, setGroups] = useState([]);
    const [connections, setConnections] = useState([]);
    const [loadedData, setLoadedData] = useState(false);

    const user = getUser();

    async function loadData() {
        if (loadedData) return;
        try {
            const [connRes, groupRes] = await Promise.all([
                fetch('/api/connections', { headers: getAuthHeaders() }),
                fetch('/api/groups', { headers: getAuthHeaders() }),
            ]);
            if (connRes.ok) {
                const data = await connRes.json();
                setConnections(data.connections || []);
            }
            if (groupRes.ok) {
                const data = await groupRes.json();
                setGroups(data.groups || []);
            }
            setLoadedData(true);
        } catch (e) {
            console.error('Failed to load sharing data:', e);
        }
    }

    // Load data when dialog opens
    if (!loadedData) loadData();

    async function handleShare() {
        if (loading) return;
        setLoading(true);
        setError('');

        try {
            let encryptedKeys = [];

            if (visibility === 'connections' && aesKeyBase64) {
                // Wrap AES key for each connection
                for (const conn of connections) {
                    if (conn.user.publicKey) {
                        const wrapped = await wrapAESKey(aesKeyBase64, conn.user.publicKey);
                        encryptedKeys.push({ userId: conn.user.id, encryptedAESKey: wrapped });
                    }
                }
            } else if (visibility === 'group' && selectedGroupId && aesKeyBase64) {
                // Get group members' public keys
                const groupRes = await fetch(`/api/groups/${selectedGroupId}`, {
                    headers: getAuthHeaders(),
                });
                if (!groupRes.ok) throw new Error('Failed to load group');
                const groupData = await groupRes.json();

                for (const member of groupData.group.members) {
                    if (member.user.publicKey && member.user.id !== user.id) {
                        const wrapped = await wrapAESKey(aesKeyBase64, member.user.publicKey);
                        encryptedKeys.push({ userId: member.user.id, encryptedAESKey: wrapped });
                    }
                }
            }

            // Create the post
            const postBody = {
                caption: caption || null,
                visibility,
                fileId,
                encryptedKeys,
            };

            if (visibility === 'public' && aesKeyBase64) {
                postBody.publicFileKey = aesKeyBase64;
            }

            if (visibility === 'group') {
                postBody.groupId = selectedGroupId;
            }

            const res = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(postBody),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to share');
            }

            onShared?.();
            onClose();
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Share File</h3>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    <div className="form-group">
                        <label>Caption (optional)</label>
                        <textarea
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            placeholder="Say something about this file..."
                            maxLength={2000}
                            rows={3}
                        />
                    </div>

                    <div className="form-group">
                        <label>Visibility</label>
                        <div className="visibility-options">
                            <label className={`visibility-option ${visibility === 'public' ? 'selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="visibility"
                                    value="public"
                                    checked={visibility === 'public'}
                                    onChange={(e) => setVisibility(e.target.value)}
                                />
                                <span>🌐 Public</span>
                                <small>Anyone can see and download</small>
                            </label>
                            <label className={`visibility-option ${visibility === 'connections' ? 'selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="visibility"
                                    value="connections"
                                    checked={visibility === 'connections'}
                                    onChange={(e) => setVisibility(e.target.value)}
                                />
                                <span>🔗 Connections ({connections.length})</span>
                                <small>Only your connections can decrypt</small>
                            </label>
                            <label className={`visibility-option ${visibility === 'group' ? 'selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="visibility"
                                    value="group"
                                    checked={visibility === 'group'}
                                    onChange={(e) => setVisibility(e.target.value)}
                                />
                                <span>👥 Group</span>
                                <small>Only group members can decrypt</small>
                            </label>
                        </div>
                    </div>

                    {visibility === 'group' && (
                        <div className="form-group">
                            <label>Select Group</label>
                            <select
                                value={selectedGroupId}
                                onChange={(e) => setSelectedGroupId(e.target.value)}
                            >
                                <option value="">Choose a group...</option>
                                {groups.map((g) => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {error && <div className="auth-error">{error}</div>}
                </div>

                <div className="modal-footer">
                    <button className="btn-secondary" onClick={onClose} disabled={loading}>
                        Cancel
                    </button>
                    <button
                        className="auth-btn"
                        onClick={handleShare}
                        disabled={loading || (visibility === 'group' && !selectedGroupId)}
                    >
                        {loading ? 'Encrypting & Sharing...' : 'Share'}
                    </button>
                </div>
            </div>
        </div>
    );
}
