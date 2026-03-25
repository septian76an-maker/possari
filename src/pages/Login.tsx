import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, signInWithEmailAndPassword, collection, query, where, getDocs } from '../firebase';
import { useSettings } from '../SettingsContext';
import { LogIn, Lock, User, AlertCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [identifier, setIdentifier] = useState(''); // Can be email or username
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let email = identifier;
      
      // Check if identifier is an email
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      
      if (!isEmail) {
        // Hardcoded fallback for 'ari' to ensure it works even before first admin login
        if (identifier.toLowerCase() === 'ari') {
          email = 'ari@jasapro.com';
        } else {
          // If not 'ari', look up in Firestore
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('name', '==', identifier));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            email = querySnapshot.docs[0].data().email;
          } else {
            // Try lowercase as fallback
            const qLower = query(usersRef, where('name', '==', identifier.toLowerCase()));
            const querySnapshotLower = await getDocs(qLower);
            if (!querySnapshotLower.empty) {
              email = querySnapshotLower.docs[0].data().email;
            } else {
              throw new Error('Username tidak ditemukan.');
            }
          }
        }
      }

      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err: any) {
      console.error('Login failed:', err);
      if (err.message === 'Username tidak ditemukan.') {
        setError('Username tidak ditemukan di database profil.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('PENTING: Fitur Email/Password belum diaktifkan di Firebase Console. Silakan aktifkan di menu Authentication > Sign-in method.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Username/Email atau password salah. Pastikan akun sudah didaftarkan di Firebase Console > Authentication > Users.');
      } else {
        setError('Gagal masuk: ' + (err.message || 'Silakan coba lagi.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-app-card rounded-2xl border border-app-border shadow-2xl p-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-app-primary rounded-2xl flex items-center justify-center mx-auto mb-6 overflow-hidden">
            {settings.appLogo ? (
              <img src={settings.appLogo} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-white text-3xl font-black">{settings.appName.charAt(0)}</span>
            )}
          </div>
          <h1 className="text-3xl font-black text-app-text tracking-tight mb-2">{settings.appName}</h1>
          <p className="text-app-text-muted">Sistem Manajemen Penjualan Jasa & Invoice</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm font-medium">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Username atau Email</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
              <input
                required
                type="text"
                placeholder=""
                className="w-full pl-12 pr-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
              <input
                required
                type="password"
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            disabled={loading}
            type="submit"
            className="w-full flex items-center justify-center gap-3 bg-app-primary text-white py-4 rounded-xl font-bold hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Memproses...' : (
              <>
                <LogIn size={20} />
                Masuk ke Aplikasi
              </>
            )}
          </button>
        </form>

        <p className="mt-10 text-center text-xs text-app-text-muted">
          Gunakan akun yang telah didaftarkan oleh Admin.
        </p>
      </div>
    </div>
  );
};
