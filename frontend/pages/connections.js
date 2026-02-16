import { useState, useEffect } from 'react';
import AuthGuard from '../components/AuthGuard';
import Navbar from '../components/Navbar';
import { authFetch, getUser } from '../lib/authStore';

export default function ConnectionsPage() {
    return (
        <AuthGuard>
            <ConnectionsContent />
        </AuthGuard>
    );
}

function ConnectionsContent() {
    const [tab, setTab] = useState('connections'); // connections | pending | search
    const [connections, setConnections] = useState([]);
    const [pending, setPending] = useState([]);
    const [sent, setSent] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState({ text: '', type: '' });

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [connRes, pendRes, sentRes] = await Promise.all([
                authFetch('/api/connections'),
                authFetch('/api/connections/pending'),
                authFetch('/api/connections/sent'),
            ]);
            if (connRes.ok) {
                const d = await connRes.json();
                setConnections(Array.isArray(d) ? d : d.connections || []);
            }
            if (pendRes.ok) {
                const d = await pendRes.json();
                setPending(Array.isArray(d) ? d : d.requests || []);
            }
            if (sentRes.ok) {
                const d = await sentRes.json();
                setSent(Array.isArray(d) ? d : d.requests || []);
            }
        } catch (e) {
            console.error('Load connections failed:', e);
        }
        setLoading(false);
    }

    async function handleSearch(e) {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setSearching(true);
        try {
            const res = await authFetch(`/api/connections/search?q=${encodeURIComponent(searchQuery.trim())}`);
            if (res.ok) {
                const d = await res.json();
                setSearchResults(Array.isArray(d) ? d : d.users || []);
            }
        } catch (e) {
            console.error('Search failed:', e);
        }
        setSearching(false);
    }

    async function sendRequest(userId) {
        try {
            const res = await authFetch('/api/connections/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiverId: userId }),
            });
            if (res.ok) {
                setMsg({ text: 'Connection request sent!', type: 'success' });
                loadData();
                // Remove from search results
                setSearchResults(prev => prev.filter(u => u.id !== userId));
            } else {
                const data = await res.json();
                setMsg({ text: data.error || 'Failed to send request', type: 'error' });
            }
        } catch (e) {
            setMsg({ text: 'Network error', type: 'error' });
        }
    }

    async function acceptRequest(connId) {
        try {
            const res = await authFetch(`/api/connections/${connId}/accept`, { method: 'POST' });
            if (res.ok) {
                setMsg({ text: 'Connection accepted!', type: 'success' });
                loadData();
            }
        } catch (e) {
            setMsg({ text: 'Failed to accept', type: 'error' });
        }
    }

    async function declineRequest(connId) {
        try {
            const res = await authFetch(`/api/connections/${connId}/decline`, { method: 'POST' });
            if (res.ok) {
                loadData();
            }
        } catch (e) {
            setMsg({ text: 'Failed to decline', type: 'error' });
        }
    }

    async function removeConnection(connId) {
        if (!confirm('Remove this connection?')) return;
        try {
            const res = await authFetch(`/api/connections/${connId}`, { method: 'DELETE' });
            if (res.ok) {
                setMsg({ text: 'Connection removed', type: 'success' });
                loadData();
            }
        } catch (e) {
            setMsg({ text: 'Failed to remove', type: 'error' });
        }
    }

    const AVATARS = ['🦊', '🐺', '🦁', '🐯', '🦅', '🐉', '🦈', '🐙', '🦇', '🐸', '🦉', '🐲'];
    const getAvatar = (id) => AVATARS[id] || '👤';

    if (loading) return (<div><Navbar /><div className="container"><div className="loading-spinner"><div className="spinner"></div></div></div></div>);

    return (
        <div>
            <Navbar />
            <div className="container">
                <h2>Connections</h2>

                {msg.text && <div className={`message ${msg.type}`}>{msg.text}</div>}

                <div className="tab-bar">
                    <button
                        className={`tab-btn ${tab === 'connections' ? 'active' : ''}`}
                        onClick={() => setTab('connections')}
                    >
                        My Connections ({connections.length})
                    </button>
                    <button
                        className={`tab-btn ${tab === 'pending' ? 'active' : ''}`}
                        onClick={() => setTab('pending')}
                    >
                        Pending {pending.length > 0 && <span className="badge">{pending.length}</span>}
                    </button>
                    <button
                        className={`tab-btn ${tab === 'search' ? 'active' : ''}`}
                        onClick={() => setTab('search')}
                    >
                        Find People
                    </button>
                </div>

                {tab === 'connections' && (
                    <div className="connections-list">
                        {connections.length === 0 ? (
                            <div className="empty-feed">
                                <p>No connections yet. Search for people to connect with!</p>
                                <button className="btn-primary" onClick={() => setTab('search')}>Find People</button>
                            </div>
                        ) : (
                            connections.map(conn => {
                                const other = conn.user || conn.receiver || conn.requester;
                                const connId = conn.connectionId || conn.id;
                                return (
                                    <div key={connId} className="user-card">
                                        <span className="user-avatar-lg">{getAvatar(other?.avatarId)}</span>
                                        <div className="user-info">
                                            <span className="user-name">{other?.username}</span>
                                            <span className="user-meta">Connected</span>
                                        </div>
                                        <button className="btn-danger-sm" onClick={() => removeConnection(connId)}>Remove</button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {tab === 'pending' && (
                    <div className="connections-list">
                        {pending.length === 0 && sent.length === 0 ? (
                            <div className="empty-feed"><p>No pending requests</p></div>
                        ) : (
                            <>
                                {pending.length > 0 && (
                                    <>
                                        <h3 className="sub-heading">Incoming Requests</h3>
                                        {pending.map(conn => {
                                            const from = conn.from || conn.requester;
                                            const connId = conn.connectionId || conn.id;
                                            return (
                                            <div key={connId} className="user-card">
                                                <span className="user-avatar-lg">{getAvatar(from?.avatarId)}</span>
                                                <div className="user-info">
                                                    <span className="user-name">{from?.username}</span>
                                                    <span className="user-meta">Wants to connect</span>
                                                </div>
                                                <div className="user-actions">
                                                    <button className="btn-primary-sm" onClick={() => acceptRequest(connId)}>Accept</button>
                                                    <button className="btn-danger-sm" onClick={() => declineRequest(connId)}>Decline</button>
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </>
                                )}
                                {sent.length > 0 && (
                                    <>
                                        <h3 className="sub-heading">Sent Requests</h3>
                                        {sent.map(conn => {
                                            const to = conn.to || conn.receiver;
                                            const connId = conn.connectionId || conn.id;
                                            return (
                                            <div key={connId} className="user-card">
                                                <span className="user-avatar-lg">{getAvatar(to?.avatarId)}</span>
                                                <div className="user-info">
                                                    <span className="user-name">{to?.username}</span>
                                                    <span className="user-meta">Pending</span>
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                )}

                {tab === 'search' && (
                    <div className="search-section">
                        <form onSubmit={handleSearch} className="search-form">
                            <input
                                type="text"
                                placeholder="Search by username..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="search-input"
                            />
                            <button type="submit" disabled={searching} className="btn-primary">
                                {searching ? 'Searching...' : 'Search'}
                            </button>
                        </form>
                        <div className="connections-list">
                            {searchResults.map(user => (
                                <div key={user.id} className="user-card">
                                    <span className="user-avatar-lg">{getAvatar(user.avatarId)}</span>
                                    <div className="user-info">
                                        <span className="user-name">{user.username}</span>
                                    </div>
                                    {user.connectionStatus === 'none' && (
                                        <button className="btn-primary-sm" onClick={() => sendRequest(user.id)}>Connect</button>
                                    )}
                                    {user.connectionStatus === 'pending' && (
                                        <span className="status-badge">Pending</span>
                                    )}
                                    {user.connectionStatus === 'accepted' && (
                                        <span className="status-badge connected">Connected</span>
                                    )}
                                </div>
                            ))}
                            {searchResults.length === 0 && searchQuery && !searching && (
                                <p className="empty-text">No users found</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
