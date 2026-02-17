import { useState, useEffect, useRef } from 'react';
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

/* SVG Icons */
const IconPlus = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);
const IconUsers = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);
const IconChevron = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
);
const IconX = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const IconCheck = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);

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
    const modalRef = useRef(null);

    const AVATARS = ['🦊', '🐺', '🦁', '🐯', '🦅', '🐉', '🦈', '🐙', '🦇', '🐸', '🦉', '🐲'];
    const getAvatar = (id) => AVATARS[id] || '👤';

    useEffect(() => { loadGroups(); }, []);

    useEffect(() => {
        if (msg.text) {
            const t = setTimeout(() => setMsg({ text: '', type: '' }), 3000);
            return () => clearTimeout(t);
        }
    }, [msg]);

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
        setNewGroupName('');
        setSelectedMembers([]);
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
                <div className="groups-page">
                    {/* Create button */}
                    <button className="groups-create-btn" onClick={openCreateForm}>
                        <IconPlus /> New Group
                    </button>

                    {msg.text && <div className={`message ${msg.type}`}>{msg.text}</div>}

                    {/* Create Modal */}
                    {showCreate && (
                        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                            <div className="modal-content" ref={modalRef} onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3>Create Group</h3>
                                    <button className="modal-close-btn" onClick={() => setShowCreate(false)}>
                                        <IconX />
                                    </button>
                                </div>
                                <form onSubmit={handleCreate}>
                                    <input
                                        type="text"
                                        placeholder="Group name"
                                        value={newGroupName}
                                        onChange={e => setNewGroupName(e.target.value)}
                                        className="form-input"
                                        autoFocus
                                        required
                                    />
                                    <div className="modal-section-label">Add Members</div>
                                    <div className="member-list">
                                        {connections.length === 0 ? (
                                            <div className="member-empty">No connections to add</div>
                                        ) : connections.map(user => {
                                            const selected = selectedMembers.includes(user.id);
                                            return (
                                                <div
                                                    key={user.id}
                                                    className={`member-item${selected ? ' member-selected' : ''}`}
                                                    onClick={() => toggleMember(user.id)}
                                                >
                                                    <span className="member-avatar">{getAvatar(user.avatarId)}</span>
                                                    <span className="member-name">{user.username}</span>
                                                    <span className={`member-check${selected ? ' checked' : ''}`}>
                                                        {selected && <IconCheck />}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="modal-actions">
                                        <button type="button" className="btn-modal-cancel" onClick={() => setShowCreate(false)}>Cancel</button>
                                        <button type="submit" className="btn-modal-confirm" disabled={creating}>
                                            {creating ? 'Creating...' : 'Create'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* Groups List */}
                    <div className="groups-list">
                        {groups.length === 0 ? (
                            <div className="groups-empty">
                                <div className="groups-empty-icon">
                                    <IconUsers />
                                </div>
                                <p>No groups yet</p>
                                <span>Create a group to share with multiple people at once</span>
                            </div>
                        ) : groups.map(group => (
                            <div key={group.id} className="group-card" onClick={() => router.push(`/groups/${group.id}`)}>
                                <div className="group-icon">
                                    <IconUsers />
                                </div>
                                <div className="group-info">
                                    <span className="group-name">{group.name}</span>
                                    <span className="group-meta">{group.members?.length || 0} members</span>
                                </div>
                                <span className="group-arrow">
                                    <IconChevron />
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
