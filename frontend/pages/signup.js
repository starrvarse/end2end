import { useState } from 'react';
import { useRouter } from 'next/router';
import { signup } from '../lib/authStore';

const AVATARS = Array.from({ length: 12 }, (_, i) => i);

export default function SignupPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [avatarId, setAvatarId] = useState(0);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [stage, setStage] = useState(''); // '' | 'creating' | 'generating_keys'

    async function handleSignup(e) {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
            setError('Password must contain uppercase, lowercase, and a number');
            return;
        }

        setLoading(true);
        setStage('creating');

        try {
            setStage('generating_keys');
            await signup(username, password, avatarId);
            router.push('/feed');
        } catch (err) {
            setError(err.message);
            setStage('');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>Create Account</h1>
                    <p>Set up your secure encrypted profile</p>
                </div>

                <form onSubmit={handleSignup} className="auth-form">
                    {/* Avatar Picker */}
                    <div className="form-group">
                        <label>Choose Avatar</label>
                        <div className="avatar-grid">
                            {AVATARS.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    className={`avatar-option ${avatarId === id ? 'selected' : ''}`}
                                    onClick={() => setAvatarId(id)}
                                    disabled={loading}
                                >
                                    <div className="avatar-icon" data-avatar={id}>
                                        {getAvatarEmoji(id)}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="3-20 chars, letters/numbers/underscore"
                            required
                            pattern="^[a-zA-Z0-9_]{3,20}$"
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min 8 chars, upper+lower+number"
                            required
                            minLength={8}
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter your password"
                            required
                            disabled={loading}
                        />
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    {loading && stage && (
                        <div className="auth-stage">
                            {stage === 'creating' && 'Creating account...'}
                            {stage === 'generating_keys' && 'Generating RSA-4096 encryption keys... This may take a moment.'}
                        </div>
                    )}

                    <button type="submit" className="auth-btn" disabled={loading}>
                        {loading ? 'Setting up...' : 'Create Account'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>Already have an account? <a href="/login" onClick={(e) => { e.preventDefault(); router.push('/login'); }}>Sign In</a></p>
                </div>

                <div className="security-note">
                    <strong>Security:</strong> A 4096-bit RSA key pair will be generated in your browser.
                    Your private key is encrypted with your password before being stored.
                    The server never sees your private key or file contents.
                </div>
            </div>
        </div>
    );
}

function getAvatarEmoji(id) {
    const emojis = ['🦊', '🐺', '🦁', '🐯', '🦅', '🐉', '🦈', '🐙', '🦇', '🐸', '🦉', '🐲'];
    return emojis[id] || '👤';
}
