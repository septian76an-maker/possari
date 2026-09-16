import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { signOut, auth } from '../firebase';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  FileText, 
  LogOut, 
  Menu, 
  X,
  User,
  UserCog,
  Settings as SettingsIcon,
  Tag,
  ChevronDown,
  ChevronRight,
  History,
  BarChart3,
  QrCode
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [openMenus, setOpenMenus] = React.useState<string[]>(['Voucher', 'Pengaturan']);
  const [tabs, setTabs] = React.useState<{ name: string; path: string }[]>([]);

  const toggleMenu = (name: string) => {
    setOpenMenus(prev => 
      prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name]
    );
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Klien', path: '/clients', icon: Users },
    { name: 'Jasa/Produk', path: '/services', icon: Briefcase },
    { name: 'Invoice & Penawaran', path: '/invoices', icon: FileText },
    { 
      name: 'Voucher', 
      path: '/vouchers', 
      icon: Tag,
      subItems: [
        { name: 'Daftar Voucher', path: '/vouchers', icon: Tag },
        { name: 'Log Voucher', path: '/voucher-logs', icon: History },
        { name: 'Data Voucher', path: '/voucher-stats', icon: BarChart3 },
      ]
    },
  ];

  if (isAdmin) {
    menuItems.push({ name: 'Manajemen User', path: '/users', icon: UserCog });
    menuItems.push({ 
      name: 'Pengaturan', 
      path: '/settings', 
      icon: SettingsIcon,
      subItems: [
        { name: 'Pengaturan Umum', path: '/settings', icon: SettingsIcon },
        { name: 'Pembayaran QRIS', path: '/settings/qris', icon: QrCode },
      ]
    });
  }

  // Auto expand menu if on active sub-item
  React.useEffect(() => {
    if (location.pathname.startsWith('/settings')) {
      setOpenMenus(prev => prev.includes('Pengaturan') ? prev : [...prev, 'Pengaturan']);
    } else if (location.pathname.startsWith('/voucher')) {
      setOpenMenus(prev => prev.includes('Voucher') ? prev : [...prev, 'Voucher']);
    }
  }, [location.pathname]);

  // Add tab when location changes
  React.useEffect(() => {
    let currentMenuItem: { name: string; path: string } | undefined;
    
    for (const item of menuItems) {
      if (item.path === location.pathname) {
        currentMenuItem = item;
        break;
      }
      if ('subItems' in item && item.subItems) {
        const sub = item.subItems.find(s => s.path === location.pathname);
        if (sub) {
          currentMenuItem = sub;
          break;
        }
      }
    }

    if (currentMenuItem) {
      setTabs(prev => {
        if (prev.find(t => t.path === currentMenuItem!.path)) return prev;
        return [...prev, { name: currentMenuItem!.name, path: currentMenuItem!.path }];
      });
    }
  }, [location.pathname]);

  const closeTab = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.path !== path);
    setTabs(newTabs);
    
    // If we closed the active tab, navigate to the last remaining tab or dashboard
    if (location.pathname === path) {
      if (newTabs.length > 0) {
        navigate(newTabs[newTabs.length - 1].path);
      } else {
        navigate('/');
      }
    }
  };

  return (
    <div className="min-h-screen bg-app-bg flex text-app-text">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 bg-app-card border-r border-app-border z-50 transition-transform lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 flex flex-col",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <div className="h-full flex flex-col min-h-0">
          <div className="p-6 border-b border-app-border/50 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-app-primary rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                  {settings.appLogo ? (
                    <img src={settings.appLogo} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-white text-lg font-black">{settings.appName.charAt(0)}</span>
                  )}
                </div>
                <h1 className="text-xl font-bold text-app-text tracking-tight truncate max-w-[120px]">{settings.appName}</h1>
              </div>
              <button className="lg:hidden text-app-text p-1 hover:bg-app-bg rounded-lg" onClick={() => setIsSidebarOpen(false)}>
                <X size={20} />
              </button>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto min-h-0">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const hasSubItems = 'subItems' in item && item.subItems;
              const isMenuOpen = openMenus.includes(item.name);
              const isActive = location.pathname === item.path || (hasSubItems && item.subItems.some(sub => location.pathname === sub.path));
              
              return (
                <div key={item.name} className="space-y-1">
                  {hasSubItems ? (
                    <button
                      onClick={() => toggleMenu(item.name)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isActive 
                          ? "bg-app-primary text-white" 
                          : "text-app-text-muted hover:bg-app-bg"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={18} />
                        {item.name}
                      </div>
                      {isMenuOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : (
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isActive 
                          ? "bg-app-primary text-white" 
                          : "text-app-text-muted hover:bg-app-bg"
                      )}
                      onClick={() => setIsSidebarOpen(false)}
                    >
                      <Icon size={18} />
                      {item.name}
                    </Link>
                  )}

                  {hasSubItems && isMenuOpen && (
                    <div className="pl-4 space-y-1">
                      {item.subItems.map(sub => {
                        const SubIcon = sub.icon;
                        const isSubActive = location.pathname === sub.path;
                        return (
                          <Link
                            key={sub.path}
                            to={sub.path}
                            className={cn(
                              "flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-medium transition-colors",
                              isSubActive 
                                ? "bg-app-bg text-app-text" 
                                : "text-app-text-muted hover:bg-app-bg/50"
                            )}
                            onClick={() => setIsSidebarOpen(false)}
                          >
                            <SubIcon size={14} />
                            {sub.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Static User Info & Logout Card at Bottom Left */}
          <div className="p-3.5 border-t border-app-border/60 shrink-0 bg-app-card mt-auto sticky bottom-0 z-10">
            <div className="bg-app-bg/70 border border-app-border/70 rounded-xl p-3 shadow-xs space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-app-primary/10 border border-app-primary/20 flex items-center justify-center text-app-primary font-bold shrink-0">
                  {profile?.name ? profile.name.charAt(0).toUpperCase() : <User size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-app-text truncate leading-tight">{profile?.name || 'Pengguna'}</p>
                  <span className="inline-block text-[10px] font-semibold text-app-text-muted uppercase tracking-wider bg-app-card px-1.5 py-0.5 rounded border border-app-border/50 mt-0.5">
                    {profile?.role || 'Staff'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-red-500 hover:text-white hover:bg-red-500 border border-red-500/20 hover:border-red-500 transition-all shadow-xs"
              >
                <LogOut size={15} />
                Keluar
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="bg-app-card border-b border-app-border flex flex-col">
          <div className="h-16 flex items-center px-6">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 -ml-2 lg:hidden text-app-text">
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h1 className="ml-4 text-lg font-bold text-app-text">{settings.appName}</h1>
          </div>
          
          {/* Tabs Section - Now in Main Content */}
          {tabs.length > 0 && (
            <div className="px-6 pb-3 flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <div
                  key={tab.path}
                  onClick={() => navigate(tab.path)}
                  className={cn(
                    "group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all border",
                    location.pathname === tab.path
                      ? "bg-app-primary text-white border-app-primary shadow-sm"
                      : "bg-app-card text-app-text-muted border-app-border hover:border-app-text-muted/30"
                  )}
                >
                  <span className="truncate max-w-[100px]">{tab.name}</span>
                  <button
                    onClick={(e) => closeTab(e, tab.path)}
                    className={cn(
                      "p-0.5 rounded-md transition-colors",
                      location.pathname === tab.path
                        ? "hover:bg-white/20 text-white/60 hover:text-white"
                        : "hover:bg-app-bg text-app-text-muted hover:text-app-text"
                    )}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
};
