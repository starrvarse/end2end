import { useState } from 'react';
import { useRouter } from 'next/router';
import { signup } from '../lib/authStore';

const AVATARS = Array.from({ length: 12 }, (_, i) => i);
const AVATAR_EMOJIS = ['🦊', '🐺', '🦁', '🐯', '🦅', '🐉', '🦈', '🐙', '🦇', '🐸', '🦉', '🐲'];

/* ── Terms & Conditions Modal ── */
function TermsModal({ onAccept, onClose }) {
    return (
        <div className="tc-overlay" onClick={onClose}>
            <div className="tc-panel" onClick={(e) => e.stopPropagation()}>
                <div className="tc-header">
                    <div className="tc-header-left">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        <span>Terms &amp; Conditions</span>
                    </div>
                    <button className="tc-close" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                <div className="tc-body">
                    <p className="tc-updated">Last updated: February 2026</p>

                    <section className="tc-section">
                        <h3>1. End-to-End Encryption</h3>
                        <p>
                            E2E is built on a <strong>zero-knowledge architecture</strong>. All files are encrypted on your device
                            using <strong>AES-256-GCM</strong> before they ever leave your browser. The encryption key is generated
                            locally and is never transmitted to or stored on our server in plaintext form.
                        </p>
                        <p>
                            The server has <strong>no ability to read, view, or decrypt</strong> any file you upload. We cannot see
                            file names, file contents, previews, or any metadata about what you store. Your data is opaque to us
                            by design — not by policy.
                        </p>
                    </section>

                    <section className="tc-section">
                        <h3>2. How Your Data Is Stored</h3>
                        <p>
                            When you upload a file, the following process occurs entirely in your browser:
                        </p>
                        <ul className="tc-list">
                            <li>A unique <strong>AES-256-GCM encryption key</strong> is generated for each file</li>
                            <li>The file is encrypted with this key, producing ciphertext that is meaningless without the key</li>
                            <li>The encrypted data is split into <strong>chunks</strong> and distributed across connected devices on the network</li>
                            <li>Chunks are stored in your browser&apos;s <strong>IndexedDB</strong> (local storage on your device)</li>
                            <li>The encryption key is stored only in your browser&apos;s IndexedDB and optionally wrapped with your RSA public key for multi-device access</li>
                        </ul>
                        <p>
                            The server acts only as a <strong>relay and coordinator</strong> — it facilitates chunk routing between
                            your devices but never stores the actual file data or encryption keys in usable form.
                        </p>
                    </section>

                    <section className="tc-section">
                        <h3>3. RSA Key Pair &amp; Identity</h3>
                        <p>
                            During signup, a <strong>4096-bit RSA key pair</strong> is generated entirely in your browser:
                        </p>
                        <ul className="tc-list">
                            <li><strong>Public Key</strong> — stored on the server so others can encrypt data they want to share with you</li>
                            <li><strong>Private Key</strong> — encrypted with your password using a key derivation function, then stored. The server never sees your raw private key</li>
                        </ul>
                        <p>
                            When someone shares a file with you, they wrap the file&apos;s AES key with your public key. Only your
                            private key (unlocked with your password) can decrypt it.
                        </p>
                    </section>

                    <section className="tc-section">
                        <h3>4. How Data Can Become Inaccessible</h3>
                        <p className="tc-warning">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            <strong>Important:</strong> Because of the zero-knowledge design, there are scenarios where your data
                            becomes permanently inaccessible. We cannot recover it for you.
                        </p>
                        <ul className="tc-list tc-list-warning">
                            <li><strong>Clearing browser data</strong> — If you clear your browser&apos;s IndexedDB, localStorage, or all site data, your encryption keys and stored chunks are permanently deleted</li>
                            <li><strong>Forgetting your password</strong> — Your private key is encrypted with your password. If you forget it, your private key cannot be recovered, and any files shared with you become unreadable</li>
                            <li><strong>Losing all devices</strong> — Since file chunks are stored on your connected devices, if all devices that hold chunks go offline or are wiped, those file chunks are lost</li>
                            <li><strong>Uninstalling the browser</strong> — Browser storage is tied to the browser installation. Uninstalling removes all locally stored keys and chunks</li>
                            <li><strong>Using incognito/private mode</strong> — Private browsing sessions do not persist IndexedDB data. Files uploaded in incognito will be lost when the window closes</li>
                        </ul>
                    </section>

                    <section className="tc-section">
                        <h3>5. What the Server Stores</h3>
                        <p>The server stores only:</p>
                        <ul className="tc-list">
                            <li>Your username and hashed password (bcrypt)</li>
                            <li>Your <strong>public</strong> RSA key (not the private key)</li>
                            <li>Your encrypted private key (useless without your password)</li>
                            <li>File metadata: file ID, owner ID, original file name, size, MIME type — <strong>but never the file contents</strong></li>
                            <li>Encrypted AES key shares (wrapped with recipients&apos; public keys) for file sharing</li>
                            <li>Social data: connections, groups, posts, comments, likes</li>
                        </ul>
                        <p>
                            The server <strong>does not</strong> store: raw file data, raw encryption keys, your password in
                            plaintext, your private key in plaintext, or any decrypted file content.
                        </p>
                    </section>

                    <section className="tc-section">
                        <h3>6. Chunk Distribution &amp; Availability</h3>
                        <p>
                            Files are split into encrypted chunks and distributed to devices connected to the network through
                            WebSocket connections. For a file to be downloadable, <strong>all chunks must be available</strong> from
                            at least one connected device.
                        </p>
                        <p>
                            If a device holding chunks goes offline, those chunks are temporarily unavailable. If that device never
                            reconnects (or its browser data is cleared), those chunks are <strong>permanently lost</strong>.
                        </p>
                        <p>
                            We recommend keeping at least one device connected and ensuring you have backups of important files
                            outside of this system if permanent availability is critical.
                        </p>
                    </section>

                    <section className="tc-section">
                        <h3>7. No Warranty &amp; Limitation of Liability</h3>
                        <p>
                            This service is provided <strong>&quot;as-is&quot;</strong> without warranty of any kind. We do not guarantee
                            data availability, permanence, or recoverability. Because we cannot access your encrypted data, we
                            <strong> cannot assist with data recovery</strong> under any circumstances.
                        </p>
                        <p>
                            You are solely responsible for maintaining access to your credentials, keeping your devices connected,
                            and backing up critical files through other means.
                        </p>
                    </section>

                    <section className="tc-section">
                        <h3>8. Privacy</h3>
                        <p>
                            We do not track you, sell your data, or run analytics. No cookies are used for tracking — only
                            essential authentication tokens. The platform is designed to operate on a local network (LAN) and
                            prioritizes your privacy above all else.
                        </p>
                    </section>

                    <section className="tc-section">
                        <h3>9. Account Deletion</h3>
                        <p>
                            You may request account deletion at any time. Upon deletion, all server-side data associated with your
                            account (metadata, key shares, social data) will be removed. Encrypted chunks stored on other
                            users&apos; devices cannot be recalled or deleted by the server.
                        </p>
                    </section>

                    <section className="tc-section">
                        <h3>10. Acceptance</h3>
                        <p>
                            By creating an account, you acknowledge that you have read, understood, and agree to these terms. You
                            understand the risks of data loss inherent to a zero-knowledge, end-to-end encrypted system and accept
                            full responsibility for maintaining access to your data.
                        </p>
                    </section>
                </div>

                <div className="tc-footer">
                    <button className="tc-btn-decline" onClick={onClose}>Decline</button>
                    <button className="tc-btn-accept" onClick={onAccept}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        I Accept
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SignupPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [avatarId, setAvatarId] = useState(0);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [stage, setStage] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [showTerms, setShowTerms] = useState(false);

    // Password strength
    const pwLength = password.length >= 8;
    const pwUpper = /[A-Z]/.test(password);
    const pwLower = /[a-z]/.test(password);
    const pwNumber = /\d/.test(password);
    const pwStrength = [pwLength, pwUpper, pwLower, pwNumber].filter(Boolean).length;

    async function handleSignup(e) {
        e.preventDefault();
        setError('');

        if (!termsAccepted) {
            setError('You must accept the Terms & Conditions');
            return;
        }

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
        <div className="au-page">
            <div className="au-card au-card-wide">
                {/* Logo */}
                <div className="au-logo">
                    <img src="/logo.png" alt="E2E" className="au-logo-img" />
                </div>

                {/* Header */}
                <div className="au-header">
                    <h1 className="au-title">Create account</h1>
                    <p className="au-subtitle">Set up your secure encrypted profile</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSignup} className="au-form">
                    {/* Avatar picker */}
                    <div className="au-field">
                        <label className="au-label">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                            Choose Avatar
                        </label>
                        <div className="au-avatars">
                            {AVATARS.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    className={`au-avatar ${avatarId === id ? 'au-avatar-active' : ''}`}
                                    onClick={() => setAvatarId(id)}
                                    disabled={loading}
                                >
                                    {AVATAR_EMOJIS[id]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="au-field">
                        <label className="au-label" htmlFor="su-username">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            Username
                        </label>
                        <input
                            id="su-username"
                            className="au-input"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="3-20 chars, letters/numbers/underscore"
                            required
                            pattern="^[a-zA-Z0-9_]{3,20}$"
                            disabled={loading}
                        />
                    </div>

                    <div className="au-field">
                        <label className="au-label" htmlFor="su-password">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                            Password
                        </label>
                        <div className="au-input-wrap">
                            <input
                                id="su-password"
                                className="au-input"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Min 8 chars, upper+lower+number"
                                required
                                minLength={8}
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
                        {/* Strength bar */}
                        {password.length > 0 && (
                            <div className="au-strength">
                                <div className="au-strength-bar">
                                    <div className={`au-strength-fill au-str-${pwStrength}`} style={{ width: `${pwStrength * 25}%` }}></div>
                                </div>
                                <div className="au-strength-checks">
                                    <span className={pwLength ? 'au-check-ok' : ''}>8+ chars</span>
                                    <span className={pwUpper ? 'au-check-ok' : ''}>A-Z</span>
                                    <span className={pwLower ? 'au-check-ok' : ''}>a-z</span>
                                    <span className={pwNumber ? 'au-check-ok' : ''}>0-9</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="au-field">
                        <label className="au-label" htmlFor="su-confirm">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Confirm Password
                        </label>
                        <input
                            id="su-confirm"
                            className="au-input"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter your password"
                            required
                            disabled={loading}
                        />
                        {confirmPassword && password !== confirmPassword && (
                            <span className="au-field-hint au-hint-error">Passwords don&apos;t match</span>
                        )}
                        {confirmPassword && password === confirmPassword && confirmPassword.length > 0 && (
                            <span className="au-field-hint au-hint-ok">Passwords match</span>
                        )}
                    </div>

                    {error && (
                        <div className="au-error">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            {error}
                        </div>
                    )}

                    {loading && stage && (
                        <div className="au-stage">
                            <span className="au-spinner"></span>
                            {stage === 'creating' && 'Creating account...'}
                            {stage === 'generating_keys' && 'Generating RSA-4096 keys — this may take a moment...'}
                        </div>
                    )}

                    {/* Terms checkbox */}
                    <div className="tc-agree">
                        <label className="tc-checkbox-wrap">
                            <input
                                type="checkbox"
                                checked={termsAccepted}
                                onChange={(e) => setTermsAccepted(e.target.checked)}
                                className="tc-checkbox"
                                disabled={loading}
                            />
                            <span className="tc-checkmark">
                                {termsAccepted && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                )}
                            </span>
                            <span className="tc-agree-text">
                                I agree to the{' '}
                                <a href="#" onClick={(e) => { e.preventDefault(); setShowTerms(true); }}>Terms &amp; Conditions</a>
                            </span>
                        </label>
                    </div>

                    <button type="submit" className="au-submit" disabled={loading || !termsAccepted}>
                        {loading ? (
                            <>
                                <span className="au-spinner"></span>
                                Setting up...
                            </>
                        ) : 'Create Account'}
                    </button>
                </form>

                {/* Footer */}
                <div className="au-footer">
                    Already have an account?{' '}
                    <a href="/login" onClick={(e) => { e.preventDefault(); router.push('/login'); }}>Sign in</a>
                </div>

                {/* Security info */}
                <div className="au-info-box">
                    <div className="au-info-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        How your data is protected
                    </div>
                    <ul className="au-info-list">
                        <li>4096-bit RSA key pair generated in your browser</li>
                        <li>Private key encrypted with your password before storage</li>
                        <li>Server never sees your private key or file contents</li>
                    </ul>
                </div>
            </div>

            {showTerms && (
                <TermsModal
                    onAccept={() => { setTermsAccepted(true); setShowTerms(false); }}
                    onClose={() => setShowTerms(false)}
                />
            )}
        </div>
    );
}
