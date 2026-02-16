import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { tryRestoreSession } from '../lib/authStore';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      const restored = await tryRestoreSession();
      router.replace(restored ? '/feed' : '/login');
    }
    redirect();
  }, []);

  return (
    <div className="loading-spinner" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner"></div>
    </div>
  );
}
