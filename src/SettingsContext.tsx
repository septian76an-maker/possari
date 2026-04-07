import React, { createContext, useContext, useEffect, useState } from 'react';
import { db, doc, onSnapshot, setDoc, handleFirestoreError, OperationType } from './firebase';
import { AppSettings } from './types';

interface SettingsContextType {
  settings: AppSettings;
  loading: boolean;
  updateSettings: (newSettings: AppSettings) => Promise<void>;
}

const defaultSettings: AppSettings = {
  appName: 'Sistem Invoice',
  appLogo: '',
  appAddress: 'Alamat Bisnis Anda',
  appPhone: '0812-xxxx-xxxx',
  appEmail: 'admin@bisnisanda.com',
  bankAccounts: [],
  theme: 'default',
  printerConfig: {
    type: 'system',
    paperWidth: '58mm',
    autoPrint: false
  }
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  loading: true,
  updateSettings: async () => {},
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as AppSettings);
      } else {
        // Initialize with defaults if not exists (only if admin, but we'll try-catch)
        setDoc(doc(db, 'settings', 'global'), defaultSettings).catch(e => {
          console.warn('Could not initialize settings (likely not an admin):', e);
        });
      }
      setLoading(false);
    }, (error) => {
      console.error('Settings fetch error:', error);
      setLoading(false);
    });

    return unsub;
  }, []);

  const updateSettings = async (newSettings: AppSettings) => {
    try {
      await setDoc(doc(db, 'settings', 'global'), newSettings);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/global');
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
