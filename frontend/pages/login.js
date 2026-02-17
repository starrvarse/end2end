import { useState } from 'react';
import { useRouter } from 'next/router';
import { login } from '../lib/authStore';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    async function handleLogin(e) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(username, password);
            router.push('/feed');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="au-page">
            <div className="au-card">
                {/* Logo */}
                <div className="au-logo">
                    <img src="/logo.png" alt="E2E" className="au-logo-img" />
                </div>

                {/* Header */}
                <div className="au-header">
                    <h1 className="au-title">Welcome back</h1>
                    <p className="au-subtitle">Sign in to your encrypted account</p>
                </div>

                {/* Form */}
                <form onSubmit={handleLogin} className="au-form">
                    <div className="au-field">
                        <label className="au-label" htmlFor="username">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            Username
                        </label>
                        <input
                            id="username"
                            className="au-input"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter your username"
                            required
                            autoFocus
                            disabled={loading}
                        />
                    </div>

                    <div className="au-field">
                        <label className="au-label" htmlFor="password">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                            Password
                        </label>
                        <div className="au-input-wrap">
                            <input
                                id="password"
                                className="au-input"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                required
                                disabled={loading}
                            />
                            <button type="button" className="au-toggle-pw" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                                {showPassword ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="au-error">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            {error}
                        </div>
                    )}

                    <button type="submit" className="au-submit" disabled={loading}>
                        {loading ? (
                            <>
                                <span className="au-spinner"></span>
                                Signing in...
                            </>
                        ) : 'Sign In'}
                    </button>
                </form>

                {/* Footer */}
                <div className="au-footer">
                    Don&apos;t have an account?{' '}
                    <a href="/signup" onClick={(e) => { e.preventDefault(); router.push('/signup'); }}>Create one</a>
                </div>

                {/* Security badge */}
                <div className="au-security">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    End-to-end encrypted
                </div>
            </div>
        </div>
    );
}
