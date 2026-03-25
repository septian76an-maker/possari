import React, { Component, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Clients } from './pages/Clients';
import { Services } from './pages/Services';
import { Invoices } from './pages/Invoices';
import { Vouchers } from './pages/Vouchers';
import { VoucherLogs } from './pages/VoucherLogs';
import { VoucherStats } from './pages/VoucherStats';
import { Users } from './pages/Users';
import { Settings } from './pages/Settings';
import { PublicInvoice } from './pages/PublicInvoice';
import { SettingsProvider, useSettings } from './SettingsContext';
import { AlertCircle, Loader2 } from 'lucide-react';

// Error Boundary Component
interface EBProps { children: React.ReactNode }
interface EBState { hasError: boolean; error: any }

class ErrorBoundary extends Component<EBProps, EBState> {
  public state: EBState = { hasError: false, error: null };

  constructor(props: EBProps) {
    super(props);
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-app-bg flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-app-card p-8 rounded-2xl border border-app-border shadow-2xl text-center">
            <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
            <h1 className="text-2xl font-black text-app-text mb-2">Terjadi Kesalahan</h1>
            <p className="text-app-text-muted mb-6">Aplikasi mengalami kendala teknis. Silakan muat ulang halaman.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-app-primary text-white py-3 rounded-xl font-bold hover:opacity-90 transition-all"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const { settings } = useSettings();

  useEffect(() => {
    if (settings.appName) {
      document.title = settings.appName;
    }
  }, [settings.appName]);

  if (loading) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-app-text-muted" size={48} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return <Layout>{children}</Layout>;
};

const ThemeWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme || 'default');
  }, [settings.theme]);

  return <>{children}</>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ThemeWrapper>
          <AuthProvider>
            <Router>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/public/invoice/:id" element={<PublicInvoice />} />
                
                <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
                <Route path="/clients" element={<PrivateRoute><Clients /></PrivateRoute>} />
                <Route path="/services" element={<PrivateRoute><Services /></PrivateRoute>} />
                <Route path="/invoices" element={<PrivateRoute><Invoices /></PrivateRoute>} />
                <Route path="/vouchers" element={<PrivateRoute><Vouchers /></PrivateRoute>} />
                <Route path="/voucher-logs" element={<PrivateRoute><VoucherLogs /></PrivateRoute>} />
                <Route path="/voucher-stats" element={<PrivateRoute><VoucherStats /></PrivateRoute>} />
                <Route path="/users" element={<PrivateRoute><Users /></PrivateRoute>} />
                <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
                
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Router>
          </AuthProvider>
        </ThemeWrapper>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
