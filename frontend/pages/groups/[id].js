import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../components/AuthGuard';
import Navbar from '../../components/Navbar';
import PostCard from '../../components/PostCard';
import MembersList from '../../components/MembersList';
import { authFetch, getUser } from '../../lib/authStore';

export default function GroupDetailPage() {
    return (
        <AuthGuard>
            <GroupDetail />
        </AuthGuard>
    );
}

/* SVG Icons */
const IconBack = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
);
const IconUserPlus = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
);
const IconUsers = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);
const IconX = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const IconPlus = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);
const IconMessageCircle = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
);
const IconChevron = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
);

function GroupDetail() {
    const router = useRouter();
    const { id } = router.query;
    const [group, setGroup] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddMember, setShowAddMember] = useState(false);
    const [showMembers, setShowMembers] = useState(false);
    const [connections, setConnections] = useState([]);
    const [msg, setMsg] = useState({ text: '', type: '' });

    const AVATARS = ['🦊', '🐺', '🦁', '🐯', '🦅', '🐉', '🦈', '🐙', '🦇', '🐸', '🦉', '🐲'];
    const getAvatar = (aid) => AVATARS[aid] || '👤';
    const me = getUser();

    useEffect(() => { if (id) loadGroup(); }, [id]);

    useEffect(() => {
        if (msg.text) {
            const t = setTimeout(() => setMsg({ text: '', type: '' }), 3000);
            return () => clearTimeout(t);
        }
    }, [msg]);

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
                <div className="gd-page">
                    {/* Header row */}
                    <div className="gd-header-row">
                        <div className="gd-nav-card">
                            <button className="gd-action-item" onClick={() => router.push('/groups')}>
                                <IconBack />
                            </button>
                            <div className="gd-action-divider" />
                            <span className="gd-action-item gd-title-item">{group.name}</span>
                        </div>
                        <div className="gd-actions-card">
                            <button className="gd-action-item" onClick={() => setShowMembers(true)}>
                                <IconUsers />
                                <span>{group.members.length} Members</span>
                            </button>
                            {isAdmin && (
                                <>
                                    <div className="gd-action-divider" />
                                    <button className="gd-action-item" onClick={openAddMember}>
                                        <IconUserPlus />
                                        <span>Add</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {msg.text && <div className={`message ${msg.type}`}>{msg.text}</div>}

                    {/* Members list modal */}
                    {showMembers && (
                        <MembersList
                            members={group.members}
                            isAdmin={isAdmin}
                            currentUserId={me?.id}
                            onRemove={removeMember}
                            onClose={() => setShowMembers(false)}
                        />
                    )}

                    {/* Posts section */}
                    <div className="gd-posts-section">
                        <div className="gd-posts-label">
                            <IconMessageCircle /> Posts
                        </div>
                        {posts.length === 0 ? (
                            <div className="gd-posts-empty">
                                <p>No posts in this group yet</p>
                            </div>
                        ) : (
                            <div className="feed-list">
                                {posts.map(post => <PostCard key={post.id} post={post} />)}
                            </div>
                        )}
                    </div>

                    {/* Add member modal */}
                    {showAddMember && (
                        <div className="modal-overlay" onClick={() => setShowAddMember(false)}>
                            <div className="modal-content" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3>Add Member</h3>
                                    <button className="modal-close-btn" onClick={() => setShowAddMember(false)}>
                                        <IconX />
                                    </button>
                                </div>
                                <div className="member-list">
                                    {connections.length === 0 ? (
                                        <div className="member-empty">All connections are already members</div>
                                    ) : connections.map(user => (
                                        <div key={user.id} className="gd-add-member-row">
                                            <span className="member-avatar">{getAvatar(user.avatarId)}</span>
                                            <span className="member-name">{user.username}</span>
                                            <button className="gd-add-member-btn" onClick={() => addMember(user.id)}>
                                                <IconPlus /> Add
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="modal-actions">
                                    <button className="btn-modal-cancel" onClick={() => setShowAddMember(false)}>Close</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
