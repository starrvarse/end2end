import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { getUser, logout, isAuthenticated } from '../lib/authStore';
import { useSocket } from '../lib/useSocket';

export default function Navbar({ pendingCount = 0 }) {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const dropdownRef = useRef(null);
    const { deviceCount } = useSocket();

    useEffect(() => {
        setUser(getUser());
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        }
        if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpen]);

    async function handleLogout() {
        await logout();
        router.push('/login');
    }

    const avatarEmojis = ['🦊', '🐺', '🦁', '🐯', '🦅', '🐉', '🦈', '🐙', '🦇', '🐸', '🦉', '🐲'];

    if (!user) return null;

    const currentPath = router.pathname;

    const navItems = [
        {
            path: '/feed', label: 'Feed',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
        },
        {
            path: '/upload', label: 'Upload',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
        },
        {
            path: '/connections', label: 'People',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
            badge: pendingCount,
        },
        {
            path: '/groups', label: 'Groups',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
        },
        {
            path: '/myfiles', label: 'Files',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
        },
    ];

    return (
        <>
            {/* Desktop top navbar */}
            <nav className="navbar">
                <div className="nav-brand" onClick={() => router.push('/feed')}>
                    <img src="/logo.png" alt="E2E" className="nav-logo-img" />
                </div>

                <div className="nav-links-desktop">
                    {navItems.map((item) => (
                        <a
                            key={item.path}
                            className={`nav-link ${currentPath === item.path ? 'active' : ''}`}
                            onClick={() => router.push(item.path)}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                            {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
                        </a>
                    ))}
                </div>

                <div className="nav-right">
                    <div className="nav-device-indicator">
                        <span className={`nav-device-dot ${deviceCount > 0 ? 'online' : ''}`}></span>
                        <span className="nav-device-text">{deviceCount}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    </div>
                    <div className="nav-user" ref={dropdownRef}>
                        <button className="nav-avatar-btn" onClick={() => setMenuOpen(!menuOpen)}>
                            <span>{avatarEmojis[user.avatarId] || '👤'}</span>
                        </button>
                        {menuOpen && (
                            <div className="nav-dropdown">
                                <div className="dropdown-user-info">
                                    <span className="dropdown-avatar">{avatarEmojis[user.avatarId] || '👤'}</span>
                                    <div>
                                        <div className="dropdown-username">{user.username}</div>
                                        <div className="dropdown-role">Encrypted Account</div>
                                    </div>
                                </div>
                                <div className="dropdown-divider"></div>
                                <a className="dropdown-item" onClick={() => { setMenuOpen(false); router.push('/myfiles'); }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                                    My Files
                                </a>
                                <a className="dropdown-item logout" onClick={() => { setMenuOpen(false); handleLogout(); }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                                    Sign Out
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </nav>

            {/* Mobile bottom tab bar */}
            <nav className="mobile-tab-bar">
                {navItems.map((item) => (
                    <a
                        key={item.path}
                        className={`tab-item ${currentPath === item.path ? 'active' : ''}`}
                        onClick={() => router.push(item.path)}
                    >
                        <span className="tab-icon">
                            {item.icon}
                            {item.badge > 0 && <span className="tab-badge">{item.badge}</span>}
                        </span>
                        <span className="tab-label">{item.label}</span>
                    </a>
                ))}
            </nav>
        </>
    );
}
