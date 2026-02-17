import { useState } from 'react';

const IconX = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const IconSearch = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
);
const IconShield = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const IconTrash = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
);

const AVATARS = ['🦊','🐺','🦁','🐯','🦅','🐉','🦈','🐙','🦇','🐸','🦉','🐲'];
const getAvatar = (aid) => AVATARS[aid] || '👤';

export default function MembersList({ members, isAdmin, currentUserId, onRemove, onClose }) {
    const [search, setSearch] = useState('');

    const filtered = members.filter(m =>
        m.user.username.toLowerCase().includes(search.toLowerCase())
    );

    const admins = filtered.filter(m => m.role === 'admin');
    const regular = filtered.filter(m => m.role !== 'admin');

    return (
        <div className="ml-overlay" onClick={onClose}>
            <div className="ml-panel" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="ml-header">
                    <h3 className="ml-title">Members</h3>
                    <span className="ml-count">{members.length}</span>
                    <button className="ml-close" onClick={onClose}><IconX /></button>
                </div>

                {/* Search */}
                {members.length > 5 && (
                    <div className="ml-search">
                        <IconSearch />
                        <input
                            type="text"
                            placeholder="Search members..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                )}

                {/* Members list */}
                <div className="ml-list">
                    {admins.length > 0 && (
                        <>
                            <div className="ml-section-label">Admins</div>
                            {admins.map(m => (
                                <MemberRow
                                    key={m.userId}
                                    member={m}
                                    isAdmin={isAdmin}
                                    isSelf={m.userId === currentUserId}
                                    onRemove={onRemove}
                                />
                            ))}
                        </>
                    )}
                    {regular.length > 0 && (
                        <>
                            {admins.length > 0 && <div className="ml-section-label">Members</div>}
                            {regular.map(m => (
                                <MemberRow
                                    key={m.userId}
                                    member={m}
                                    isAdmin={isAdmin}
                                    isSelf={m.userId === currentUserId}
                                    onRemove={onRemove}
                                />
                            ))}
                        </>
                    )}
                    {filtered.length === 0 && (
                        <div className="ml-empty">No members found</div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MemberRow({ member, isAdmin, isSelf, onRemove }) {
    const m = member;
    return (
        <div className={`ml-row ${isSelf ? 'ml-row-self' : ''}`}>
            <div className="ml-avatar">{getAvatar(m.user.avatarId)}</div>
            <div className="ml-info">
                <span className="ml-name">
                    {m.user.username}
                    {isSelf && <span className="ml-you">you</span>}
                </span>
                {m.role === 'admin' && (
                    <span className="ml-role"><IconShield /> Admin</span>
                )}
            </div>
            {isAdmin && !isSelf && (
                <button className="ml-remove" onClick={() => onRemove(m.userId)} title="Remove member">
                    <IconTrash />
                </button>
            )}
        </div>
    );
}
