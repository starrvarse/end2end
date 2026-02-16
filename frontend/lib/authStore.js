/**
 * Authentication state management.
 * - Access token stored in memory (never localStorage - XSS resistant)
 * - Refresh token in HTTP-only secure cookie (handled by browser)
 * - RSA private key decrypted at login, held in memory
 * - Auto-refresh before token expiry
 */

import {
    generateKeyPair,
    exportPublicKey,
    encryptPrivateKeyWithPassword,
    decryptPrivateKeyWithPassword,
    importPublicKey,
    setPrivateKey,
    setPublicKey,
    clearKeys,
    hasPrivateKey,
} from './keyManager';

const API_BASE = '/api';
let _accessToken = null;
let _user = null;
let _refreshTimer = null;

/**
 * Get current auth headers for API calls
 */
export function getAuthHeaders() {
    if (!_accessToken) return {};
    return { Authorization: `Bearer ${_accessToken}` };
}

/**
 * Get current access token (for WebSocket auth)
 */
export function getAccessToken() {
    return _accessToken;
}

/**
 * Get current user info
 */
export function getUser() {
    return _user;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
    return !!_accessToken && !!_user;
}

/**
 * Check if crypto keys are ready
 */
export function isKeyReady() {
    return hasPrivateKey();
}

/**
 * Schedule auto-refresh of access token (13 minutes — 2 minutes before expiry)
 */
function scheduleRefresh() {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(async () => {
        try {
            await refreshAccessToken();
        } catch (e) {
            console.error('Auto-refresh failed:', e);
            // Don't logout — user might still have a valid refresh cookie
        }
    }, 13 * 60 * 1000);
}

/**
 * Refresh the access token using the HTTP-only refresh cookie
 */
export async function refreshAccessToken() {
    try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });

        if (!res.ok) {
            _accessToken = null;
            _user = null;
            return false;
        }

        const data = await res.json();
        _accessToken = data.accessToken;
        _user = data.user;
        scheduleRefresh();
        return true;
    } catch {
        return false;
    }
}

/**
 * Sign up a new user
 * @param {string} username
 * @param {string} password
 * @param {number} avatarId - 0-11
 * @returns User info
 */
export async function signup(username, password, avatarId) {
    // 1. Create account
    const signupRes = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, avatarId }),
    });

    if (!signupRes.ok) {
        const err = await signupRes.json();
        throw new Error(err.error || err.errors?.[0]?.msg || 'Signup failed');
    }

    const signupData = await signupRes.json();
    _accessToken = signupData.accessToken;
    _user = signupData.user;

    // 2. Generate RSA key pair
    const keyPair = await generateKeyPair();

    // 3. Export public key
    const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);

    // 4. Encrypt private key with password
    const { encryptedPrivateKey, pbkdfSalt } = await encryptPrivateKeyWithPassword(
        keyPair.privateKey,
        password
    );

    // 5. Register keys on server
    const keysRes = await fetch(`${API_BASE}/keys/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        body: JSON.stringify({ publicKey: publicKeyBase64, encryptedPrivateKey, pbkdfSalt }),
    });

    if (!keysRes.ok) {
        throw new Error('Failed to register encryption keys');
    }

    // 6. Store keys in memory
    setPrivateKey(keyPair.privateKey);
    setPublicKey(keyPair.publicKey);

    scheduleRefresh();

    return _user;
}

/**
 * Log in an existing user
 * @param {string} username
 * @param {string} password
 * @returns User info
 */
export async function login(username, password) {
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
    });

    if (!loginRes.ok) {
        const err = await loginRes.json();
        throw new Error(err.error || 'Login failed');
    }

    const loginData = await loginRes.json();
    _accessToken = loginData.accessToken;
    _user = loginData.user;

    // Decrypt private key with password (if keys exist)
    if (loginData.encryptedPrivateKey && loginData.pbkdfSalt) {
        try {
            const privateKey = await decryptPrivateKeyWithPassword(
                loginData.encryptedPrivateKey,
                loginData.pbkdfSalt,
                password
            );
            setPrivateKey(privateKey);

            if (loginData.publicKey) {
                const publicKey = await importPublicKey(loginData.publicKey);
                setPublicKey(publicKey);
            }
        } catch (e) {
            console.error('Failed to decrypt private key:', e);
            // Login succeeds but crypto operations won't work
        }
    }

    scheduleRefresh();

    return _user;
}

/**
 * Log out the current user
 */
export async function logout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        });
    } catch { }

    _accessToken = null;
    _user = null;
    clearKeys();

    if (_refreshTimer) {
        clearTimeout(_refreshTimer);
        _refreshTimer = null;
    }
}

/**
 * Try to restore session from refresh cookie (on page load)
 */
export async function tryRestoreSession() {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return false;

    // We can't decrypt the private key without the password
    // The user will need to re-enter their password to unlock crypto
    // For now, return true to indicate session is valid (read-only mode)
    return true;
}

/**
 * Unlock crypto by providing password (after session restore)
 */
export async function unlockCrypto(password) {
    if (!_user) throw new Error('Not logged in');

    // Fetch user's encrypted private key
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: _user.username, password }),
    });

    if (!res.ok) {
        throw new Error('Invalid password');
    }

    const data = await res.json();
    // Update token
    _accessToken = data.accessToken;

    if (data.encryptedPrivateKey && data.pbkdfSalt) {
        const privateKey = await decryptPrivateKeyWithPassword(
            data.encryptedPrivateKey,
            data.pbkdfSalt,
            password
        );
        setPrivateKey(privateKey);

        if (data.publicKey) {
            const publicKey = await importPublicKey(data.publicKey);
            setPublicKey(publicKey);
        }
    }

    scheduleRefresh();
}

/**
 * Make an authenticated API call
 */
export async function authFetch(url, options = {}) {
    const headers = {
        ...options.headers,
        ...getAuthHeaders(),
    };

    let res = await fetch(url, { ...options, headers, credentials: 'include' });

    // If token expired, try refresh once
    if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            headers.Authorization = `Bearer ${_accessToken}`;
            res = await fetch(url, { ...options, headers, credentials: 'include' });
        }
    }

    return res;
}
