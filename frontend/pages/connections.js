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
    const [tab, setTab] = useState('connections');
    const [connections, setConnections] = useState([]);
    const [pending, setPending] = useState([]);
    const [sent, setSent] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState({ text: '', type: '' });

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [connRes, pendRes, sentRes] = await Promise.all([
                authFetch('/api/connections'),
                authFetch('/api/connections/pending'),
                authFetch('/api/connections/sent'),
            ]);
            if (connRes.ok) { const d = await connRes.json(); setConnections(Array.isArray(d) ? d : d.connections || []); }
            if (pendRes.ok) { const d = await pendRes.json(); setPending(Array.isArray(d) ? d : d.requests || []); }
            if (sentRes.ok) { const d = await sentRes.json(); setSent(Array.isArray(d) ? d : d.requests || []); }
        } catch (e) { console.error('Load connections failed:', e); }
        setLoading(false);
    }

    async function handleSearch(e) {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setSearching(true);
        try {
            const res = await authFetch(`/api/connections/search?q=${encodeURIComponent(searchQuery.trim())}`);
            if (res.ok) { const d = await res.json(); setSearchResults(Array.isArray(d) ? d : d.users || []); }
        } catch (e) { console.error('Search failed:', e); }
        setSearching(false);
    }

    async function sendRequest(userId) {
        try {
            const res = await authFetch('/api/connections/request', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiverId: userId }),
            });
            if (res.ok) {
                setMsg({ text: 'Connection request sent!', type: 'success' });
                loadData();
                setSearchResults(prev => prev.filter(u => u.id !== userId));
            } else {
                const data = await res.json();
                setMsg({ text: data.error || 'Failed', type: 'error' });
            }
        } catch (e) { setMsg({ text: 'Network error', type: 'error' }); }
    }

    async function acceptRequest(connId) {
        try {
            const res = await authFetch(`/api/connections/${connId}/accept`, { method: 'POST' });
            if (res.ok) { setMsg({ text: 'Connection accepted!', type: 'success' }); loadData(); }
        } catch (e) { setMsg({ text: 'Failed to accept', type: 'error' }); }
    }

    async function declineRequest(connId) {
        try {
            const res = await authFetch(`/api/connections/${connId}/decline`, { method: 'POST' });
            if (res.ok) loadData();
        } catch (e) { setMsg({ text: 'Failed to decline', type: 'error' }); }
    }

    async function removeConnection(connId) {
        if (!confirm('Remove this connection?')) return;
        try {
            const res = await authFetch(`/api/connections/${connId}`, { method: 'DELETE' });
            if (res.ok) { setMsg({ text: 'Connection removed', type: 'success' }); loadData(); }
        } catch (e) { setMsg({ text: 'Failed to remove', type: 'error' }); }
    }

    const AVATARS = ['🦊','🐺','🦁','🐯','🦅','🐉','🦈','🐙','🦇','🐸','🦉','🐲'];
    const getAvatar = (id) => AVATARS[id] || '👤';

    if (loading) return (<div><Navbar /><div className="container"><div className="loading-spinner"><div className="spinner"></div></div></div></div>);

    const tabs = [
        { key: 'connections', label: 'Connected', count: connections.length, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/></svg> },
        { key: 'pending', label: 'Requests', count: pending.length, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
        { key: 'search', label: 'Discover', count: null, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
    ];

    return (
        <div>
            <Navbar pendingCount={pending.length} />
            <div className="container">
                <div className="people-page">
                    {msg.text && <div className={`upload-message ${msg.type}`}>{msg.text}</div>}

                    {/* Tabs */}
                    <div className="people-tabs">
                        {tabs.map(t => (
                            <button
                                key={t.key}
                                className={`people-tab ${tab === t.key ? 'active' : ''}`}
                                onClick={() => setTab(t.key)}
                            >
                                {t.icon}
                                <span>{t.label}</span>
                                {t.count > 0 && <span className="people-tab-count">{t.count}</span>}
                            </button>
                        ))}
                    </div>

                    {/* Connected */}
                    {tab === 'connections' && (
                        <div className="people-list">
                            {connections.length === 0 ? (
                                <div className="people-empty">
                                    <div className="people-empty-icon">
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/>
                                            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
                                        </svg>
                                    </div>
                                    <p>No connections yet</p>
                                    <button className="people-empty-btn" onClick={() => setTab('search')}>Find People</button>
                                </div>
                            ) : connections.map(conn => {
                                const other = conn.user || conn.receiver || conn.requester;
                                const connId = conn.connectionId || conn.id;
                                return (
                                    <div key={connId} className="person-card">
                                        <div className="person-avatar">{getAvatar(other?.avatarId)}</div>
                                        <div className="person-info">
                                            <span className="person-name">{other?.username}</span>
                                            <span className="person-status connected">
                                                <span className="status-dot online"></span> Connected
                                            </span>
                                        </div>
                                        <button className="person-action-btn remove" onClick={() => removeConnection(connId)}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M18 6L6 18"/><path d="M6 6l12 12"/>
                                            </svg>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pending */}
                    {tab === 'pending' && (
                        <div className="people-list">
                            {pending.length === 0 && sent.length === 0 ? (
                                <div className="people-empty">
                                    <div className="people-empty-icon">
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                                        </svg>
                                    </div>
                                    <p>No pending requests</p>
                                </div>
                            ) : (
                                <>
                                    {pending.length > 0 && (
                                        <div className="people-section">
                                            <h3 className="people-section-title">Incoming</h3>
                                            {pending.map(conn => {
                                                const from = conn.from || conn.requester;
                                                const connId = conn.connectionId || conn.id;
                                                return (
                                                    <div key={connId} className="person-card">
                                                        <div className="person-avatar">{getAvatar(from?.avatarId)}</div>
                                                        <div className="person-info">
                                                            <span className="person-name">{from?.username}</span>
                                                            <span className="person-status">Wants to connect</span>
                                                        </div>
                                                        <div className="person-actions">
                                                            <button className="person-action-btn accept" onClick={() => acceptRequest(connId)}>
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="20 6 9 17 4 12"/>
                                                                </svg>
                                                            </button>
                                                            <button className="person-action-btn decline" onClick={() => declineRequest(connId)}>
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M18 6L6 18"/><path d="M6 6l12 12"/>
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {sent.length > 0 && (
                                        <div className="people-section">
                                            <h3 className="people-section-title">Sent</h3>
                                            {sent.map(conn => {
                                                const to = conn.to || conn.receiver;
                                                const connId = conn.connectionId || conn.id;
                                                return (
                                                    <div key={connId} className="person-card">
                                                        <div className="person-avatar">{getAvatar(to?.avatarId)}</div>
                                                        <div className="person-info">
                                                            <span className="person-name">{to?.username}</span>
                                                            <span className="person-status pending">Pending</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Search / Discover */}
                    {tab === 'search' && (
                        <div className="people-list">
                            <form onSubmit={handleSearch} className="people-search">
                                <div className="people-search-box">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Search by username..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="people-search-input"
                                    />
                                </div>
                                <button type="submit" disabled={searching} className="people-search-btn">
                                    {searching ? '...' : 'Search'}
                                </button>
                            </form>

                            {searchResults.map(user => (
                                <div key={user.id} className="person-card">
                                    <div className="person-avatar">{getAvatar(user.avatarId)}</div>
                                    <div className="person-info">
                                        <span className="person-name">{user.username}</span>
                                    </div>
                                    {user.connectionStatus === 'none' && (
                                        <button className="person-connect-btn" onClick={() => sendRequest(user.id)}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="8.5" cy="7" r="4"/>
                                                <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                                            </svg>
                                            Connect
                                        </button>
                                    )}
                                    {user.connectionStatus === 'pending' && (
                                        <span className="person-badge pending">Pending</span>
                                    )}
                                    {user.connectionStatus === 'accepted' && (
                                        <span className="person-badge connected">Connected</span>
                                    )}
                                </div>
                            ))}
                            {searchResults.length === 0 && searchQuery && !searching && (
                                <div className="people-empty"><p>No users found</p></div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
