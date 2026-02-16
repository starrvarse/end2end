import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { isAuthenticated, tryRestoreSession, getUser } from '../lib/authStore';

/**
 * AuthGuard wraps pages that require authentication.
 * Redirects to /login if not authenticated.
 */
export default function AuthGuard({ children }) {
    const router = useRouter();
    const [checking, setChecking] = useState(true);
    const [authed, setAuthed] = useState(false);

    useEffect(() => {
        async function check() {
            if (isAuthenticated()) {
                setAuthed(true);
                setChecking(false);
                return;
            }

            // Try to restore from refresh cookie
            const restored = await tryRestoreSession();
            if (restored) {
                setAuthed(true);
            } else {
                router.replace('/login');
            }
            setChecking(false);
        }
        check();
    }, []);

    if (checking) {
        return (
            <div className="auth-guard-loading">
                <div className="spinner"></div>
                <p>Loading...</p>
            </div>
        );
    }

    if (!authed) return null;

    return children;
}
