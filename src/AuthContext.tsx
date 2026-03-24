import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, onAuthStateChanged, doc, getDoc, setDoc, FirebaseUser } from './firebase';
import { UserProfile } from './types';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isCashier: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isCashier: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          // New user registration
          const isDefaultAdmin = user.email === 'septian76an@gmail.com' || user.email === 'septian@pos.com';
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            name: user.displayName || 'User',
            role: isDefaultAdmin ? 'admin' : 'cashier',
          };
          try {
            await setDoc(docRef, newProfile);
            setProfile(newProfile);
          } catch (error) {
            console.error('Error creating user profile:', error);
            setProfile(newProfile);
          }
        }

        // Seed 'ari' user whenever admin logs in to ensure it exists
        if (user.email === 'septian76an@gmail.com') {
          try {
            const ariRef = doc(db, 'users', 'ari_user_id');
            await setDoc(ariRef, {
              uid: 'ari_user_id',
              email: 'ari@jasapro.com',
              name: 'ari',
              role: 'cashier'
            }, { merge: true });
          } catch (e) {
            console.warn('Could not seed ari user (likely permission issue):', e);
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const isAdmin = profile?.role === 'admin';
  const isCashier = profile?.role === 'cashier' || isAdmin;

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isCashier }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
