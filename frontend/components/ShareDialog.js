import { useState } from 'react';
import { getAuthHeaders, getUser, authFetch } from '../lib/authStore';
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
                authFetch('/api/connections'),
                authFetch('/api/groups'),
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
                const groupRes = await authFetch(`/api/groups/${selectedGroupId}`);
                if (!groupRes.ok) throw new Error('Failed to load group');
                const groupData = await groupRes.json();

                let skippedCount = 0;
                for (const member of groupData.group.members) {
                    if (member.user.id === user.id) continue; // Skip self
                    if (!member.user.publicKey) {
                        console.warn(`Member ${member.user.username} has no public key — cannot share encrypted key with them`);
                        skippedCount++;
                        continue;
                    }
                    try {
                        const wrapped = await wrapAESKey(aesKeyBase64, member.user.publicKey);
                        encryptedKeys.push({ userId: member.user.id, encryptedAESKey: wrapped });
                    } catch (wrapErr) {
                        console.error(`Failed to wrap key for ${member.user.username}:`, wrapErr);
                        skippedCount++;
                    }
                }
                if (skippedCount > 0) {
                    console.warn(`${skippedCount} member(s) could not receive the encryption key`);
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

            const res = await authFetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
        <div className="sd-overlay" onClick={onClose}>
            <div className="sd-panel" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="sd-header">
                    <div className="sd-header-left">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        <h3>Share</h3>
                    </div>
                    <button className="sd-close" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                {/* Caption */}
                <div className="sd-section">
                    <label className="sd-label">Caption</label>
                    <textarea
                        className="sd-textarea"
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="Add a note..."
                        maxLength={2000}
                        rows={2}
                    />
                </div>

                {/* Visibility */}
                <div className="sd-section">
                    <label className="sd-label">Share with</label>
                    <div className="sd-options">
                        <button
                            className={`sd-option ${visibility === 'public' ? 'sd-option-active' : ''}`}
                            onClick={() => setVisibility('public')}
                        >
                            <div className="sd-option-icon sd-icon-public">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                            </div>
                            <div className="sd-option-text">
                                <span className="sd-option-name">Public</span>
                                <span className="sd-option-desc">Anyone can download</span>
                            </div>
                        </button>

                        <button
                            className={`sd-option ${visibility === 'connections' ? 'sd-option-active' : ''}`}
                            onClick={() => setVisibility('connections')}
                        >
                            <div className="sd-option-icon sd-icon-conn">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                            </div>
                            <div className="sd-option-text">
                                <span className="sd-option-name">Connections <span className="sd-option-count">{connections.length}</span></span>
                                <span className="sd-option-desc">E2E encrypted for connections</span>
                            </div>
                        </button>

                        <button
                            className={`sd-option ${visibility === 'group' ? 'sd-option-active' : ''}`}
                            onClick={() => setVisibility('group')}
                        >
                            <div className="sd-option-icon sd-icon-group">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                            </div>
                            <div className="sd-option-text">
                                <span className="sd-option-name">Group</span>
                                <span className="sd-option-desc">E2E encrypted for members</span>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Group selector */}
                {visibility === 'group' && (
                    <div className="sd-section">
                        <label className="sd-label">Select Group</label>
                        <select
                            className="sd-select"
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

                {error && <div className="sd-error">{error}</div>}

                {/* Footer */}
                <div className="sd-footer">
                    <button className="sd-btn-cancel" onClick={onClose} disabled={loading}>
                        Cancel
                    </button>
                    <button
                        className="sd-btn-share"
                        onClick={handleShare}
                        disabled={loading || (visibility === 'group' && !selectedGroupId)}
                    >
                        {loading ? (
                            <>
                                <span className="download-spinner"></span>
                                Encrypting...
                            </>
                        ) : (
                            <>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                                Share
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
