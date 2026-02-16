import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../components/AuthGuard';
import Navbar from '../../components/Navbar';
import PostCard from '../../components/PostCard';
import { authFetch, getUser } from '../../lib/authStore';

export default function GroupDetailPage() {
    return (
        <AuthGuard>
            <GroupDetail />
        </AuthGuard>
    );
}

function GroupDetail() {
    const router = useRouter();
    const { id } = router.query;
    const [group, setGroup] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddMember, setShowAddMember] = useState(false);
    const [connections, setConnections] = useState([]);
    const [msg, setMsg] = useState({ text: '', type: '' });

    const AVATARS = ['🦊', '🐺', '🦁', '🐯', '🦅', '🐉', '🦈', '🐙', '🦇', '🐸', '🦉', '🐲'];
    const getAvatar = (aid) => AVATARS[aid] || '👤';
    const me = getUser();

    useEffect(() => {
        if (id) loadGroup();
    }, [id]);

    async function loadGroup() {
        setLoading(true);
        try {
            const [gRes, pRes] = await Promise.all([
                authFetch(`/api/groups/${id}`),
                authFetch(`/api/posts/group/${id}`),
            ]);
            if (gRes.ok) {
                const gData = await gRes.json();
                setGroup(gData.group || gData);
            } else {
                router.push('/groups');
            }
            if (pRes.ok) {
                const pData = await pRes.json();
                setPosts(Array.isArray(pData) ? pData : pData.posts || []);
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    }

    async function openAddMember() {
        setShowAddMember(true);
        try {
            const res = await authFetch('/api/connections');
            if (res.ok) {
                const d = await res.json();
                const conns = Array.isArray(d) ? d : d.connections || [];
                const connUsers = conns.map(c => c.user || c.receiver || c.requester);
                // Filter out existing members
                const memberIds = new Set(group.members.map(m => m.userId));
                setConnections(connUsers.filter(u => u && !memberIds.has(u.id)));
            }
        } catch (e) { console.error(e); }
    }

    async function addMember(userId) {
        try {
            const res = await authFetch(`/api/groups/${id}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
            if (res.ok) {
                setMsg({ text: 'Member added!', type: 'success' });
                setShowAddMember(false);
                loadGroup();
            } else {
                const data = await res.json();
                setMsg({ text: data.error || 'Failed', type: 'error' });
            }
        } catch (e) {
            setMsg({ text: 'Network error', type: 'error' });
        }
    }

    async function removeMember(userId) {
        if (!confirm('Remove this member?')) return;
        try {
            const res = await authFetch(`/api/groups/${id}/members/${userId}`, { method: 'DELETE' });
            if (res.ok) {
                setMsg({ text: 'Member removed', type: 'success' });
                loadGroup();
            }
        } catch (e) {
            setMsg({ text: 'Network error', type: 'error' });
        }
    }

    const isAdmin = group?.members?.some(m => m.userId === me?.id && m.role === 'admin');

    if (loading) return (<div><Navbar /><div className="container"><div className="loading-spinner"><div className="spinner"></div></div></div></div>);
    if (!group) return null;

    return (
        <div>
            <Navbar />
            <div className="container">
                <button className="back-link" onClick={() => router.push('/groups')}>← Back to Groups</button>

                <div className="group-header">
                    <h2>👥 {group.name}</h2>
                    {isAdmin && (
                        <button className="btn-primary" onClick={openAddMember}>+ Add Member</button>
                    )}
                </div>

                {msg.text && <div className={`message ${msg.type}`}>{msg.text}</div>}

                <div className="group-members-bar">
                    <h4>Members ({group.members.length})</h4>
                    <div className="members-scroll">
                        {group.members.map(m => (
                            <div key={m.userId} className="member-chip">
                                <span className="user-avatar-sm">{getAvatar(m.user.avatarId)}</span>
                                <span>{m.user.username}</span>
                                {m.role === 'admin' && <span className="role-badge">Admin</span>}
                                {isAdmin && m.userId !== me.id && (
                                    <button className="remove-chip" onClick={() => removeMember(m.userId)}>×</button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <h3 style={{ marginTop: 24, marginBottom: 12 }}>Group Posts</h3>
                {posts.length === 0 ? (
                    <div className="empty-feed"><p>No posts in this group yet</p></div>
                ) : (
                    <div className="feed-list">
                        {posts.map(post => <PostCard key={post.id} post={post} />)}
                    </div>
                )}

                {showAddMember && (
                    <div className="modal-overlay" onClick={() => setShowAddMember(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <h3>Add Member</h3>
                            <div className="member-list">
                                {connections.length === 0 ? (
                                    <p className="empty-text">All connections are already members</p>
                                ) : connections.map(user => (
                                    <div key={user.id} className="user-card-mini">
                                        <span className="user-avatar-sm">{getAvatar(user.avatarId)}</span>
                                        <span>{user.username}</span>
                                        <button className="btn-primary-sm" onClick={() => addMember(user.id)}>Add</button>
                                    </div>
                                ))}
                            </div>
                            <div className="modal-actions">
                                <button className="btn-secondary" onClick={() => setShowAddMember(false)}>Close</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
