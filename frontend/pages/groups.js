import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../components/AuthGuard';
import Navbar from '../components/Navbar';
import { authFetch, getUser } from '../lib/authStore';

export default function GroupsPage() {
    return (
        <AuthGuard>
            <GroupsContent />
        </AuthGuard>
    );
}

function GroupsContent() {
    const router = useRouter();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [connections, setConnections] = useState([]);
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [creating, setCreating] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });

    const AVATARS = ['🦊', '🐺', '🦁', '🐯', '🦅', '🐉', '🦈', '🐙', '🦇', '🐸', '🦉', '🐲'];
    const getAvatar = (id) => AVATARS[id] || '👤';

    useEffect(() => {
        loadGroups();
    }, []);

    async function loadGroups() {
        setLoading(true);
        try {
            const res = await authFetch('/api/groups');
            if (res.ok) {
                const d = await res.json();
                setGroups(Array.isArray(d) ? d : d.groups || []);
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    }

    async function openCreateForm() {
        setShowCreate(true);
        try {
            const res = await authFetch('/api/connections');
            if (res.ok) {
                const d = await res.json();
                const conns = Array.isArray(d) ? d : d.connections || [];
                setConnections(conns.map(c => c.user || c.receiver || c.requester));
            }
        } catch (e) { console.error(e); }
    }

    function toggleMember(id) {
        setSelectedMembers(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    }

    async function handleCreate(e) {
        e.preventDefault();
        if (!newGroupName.trim()) return;
        setCreating(true);
        try {
            const res = await authFetch('/api/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newGroupName.trim(),
                    memberIds: selectedMembers,
                }),
            });
            if (res.ok) {
                setMsg({ text: 'Group created!', type: 'success' });
                setShowCreate(false);
                setNewGroupName('');
                setSelectedMembers([]);
                loadGroups();
            } else {
                const data = await res.json();
                setMsg({ text: data.error || 'Failed to create group', type: 'error' });
            }
        } catch (e) {
            setMsg({ text: 'Network error', type: 'error' });
        }
        setCreating(false);
    }

    if (loading) return (<div><Navbar /><div className="container"><div className="loading-spinner"><div className="spinner"></div></div></div></div>);

    return (
        <div>
            <Navbar />
            <div className="container">
                <div className="page-header">
                    <h2>Groups</h2>
                    <button className="btn-primary" onClick={openCreateForm}>+ New Group</button>
                </div>

                {msg.text && <div className={`message ${msg.type}`}>{msg.text}</div>}

                {showCreate && (
                    <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <h3>Create Group</h3>
                            <form onSubmit={handleCreate}>
                                <input
                                    type="text"
                                    placeholder="Group name"
                                    value={newGroupName}
                                    onChange={e => setNewGroupName(e.target.value)}
                                    className="form-input"
                                    required
                                />
                                <h4 style={{ margin: '16px 0 8px' }}>Add Members</h4>
                                <div className="member-list">
                                    {connections.length === 0 ? (
                                        <p className="empty-text">No connections to add</p>
                                    ) : connections.map(user => (
                                        <label key={user.id} className="member-item">
                                            <input
                                                type="checkbox"
                                                checked={selectedMembers.includes(user.id)}
                                                onChange={() => toggleMember(user.id)}
                                            />
                                            <span className="user-avatar-sm">{getAvatar(user.avatarId)}</span>
                                            <span>{user.username}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                                    <button type="submit" className="btn-primary" disabled={creating}>
                                        {creating ? 'Creating...' : 'Create'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <div className="groups-list">
                    {groups.length === 0 ? (
                        <div className="empty-feed">
                            <p>No groups yet. Create one to start sharing with multiple people at once!</p>
                        </div>
                    ) : groups.map(group => (
                        <div key={group.id} className="group-card" onClick={() => router.push(`/groups/${group.id}`)}>
                            <div className="group-icon">👥</div>
                            <div className="group-info">
                                <span className="group-name">{group.name}</span>
                                <span className="group-meta">{group.members?.length || 0} members</span>
                            </div>
                            <span className="group-arrow">→</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
