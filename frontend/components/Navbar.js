import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { getUser, logout, isAuthenticated } from '../lib/authStore';

export default function Navbar({ pendingCount = 0 }) {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        setUser(getUser());
    }, []);

    async function handleLogout() {
        await logout();
        router.push('/login');
    }

    const avatarEmojis = ['🦊', '🐺', '🦁', '🐯', '🦅', '🐉', '🦈', '🐙', '🦇', '🐸', '🦉', '🐲'];

    if (!user) return null;

    const currentPath = router.pathname;

    return (
        <nav className="navbar">
            <div className="nav-brand" onClick={() => router.push('/feed')}>
                <span className="nav-logo">🔐</span>
                <span className="nav-title">E2E Secure</span>
            </div>

            <div className="nav-links">
                <a
                    className={`nav-link ${currentPath === '/feed' ? 'active' : ''}`}
                    onClick={() => router.push('/feed')}
                >
                    Feed
                </a>
                <a
                    className={`nav-link ${currentPath === '/upload' ? 'active' : ''}`}
                    onClick={() => router.push('/upload')}
                >
                    Upload
                </a>
                <a
                    className={`nav-link ${currentPath === '/connections' ? 'active' : ''}`}
                    onClick={() => router.push('/connections')}
                >
                    Connections
                    {pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
                </a>
                <a
                    className={`nav-link ${currentPath === '/groups' ? 'active' : ''}`}
                    onClick={() => router.push('/groups')}
                >
                    Groups
                </a>
            </div>

            <div className="nav-user" onClick={() => setMenuOpen(!menuOpen)}>
                <span className="nav-avatar">{avatarEmojis[user.avatarId] || '👤'}</span>
                <span className="nav-username">{user.username}</span>
                {menuOpen && (
                    <div className="nav-dropdown">
                        <a className="dropdown-item" onClick={() => { setMenuOpen(false); router.push('/myfiles'); }}>
                            My Files
                        </a>
                        <a className="dropdown-item logout" onClick={() => { setMenuOpen(false); handleLogout(); }}>
                            Sign Out
                        </a>
                    </div>
                )}
            </div>
        </nav>
    );
}
