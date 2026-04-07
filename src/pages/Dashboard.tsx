import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, query, handleFirestoreError, OperationType } from '../firebase';
import { Invoice, Client, Service } from '../types';
import { useAuth } from '../AuthContext';
import { 
  TrendingUp, 
  Users, 
  Briefcase, 
  FileText, 
  ArrowUpRight, 
  ArrowDownRight,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

export const Dashboard: React.FC = () => {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalClients: 0,
    totalServices: 0,
    pendingInvoices: 0
  });
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    if (loading || !user) return;

    const unsubInvoices = onSnapshot(query(collection(db, 'invoices')), (snap) => {
      const data = snap.docs.map(d => d.data() as Invoice);
      const revenue = data.filter(i => i.status === 'paid').reduce((acc, curr) => acc + curr.total, 0);
      const pending = data.filter(i => i.status === 'pending').length;
      setStats(prev => ({ ...prev, totalRevenue: revenue, pendingInvoices: pending }));
      setRecentInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'invoices');
    });

    const unsubClients = onSnapshot(query(collection(db, 'clients')), (snap) => {
      setStats(prev => ({ ...prev, totalClients: snap.size }));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });

    const unsubServices = onSnapshot(query(collection(db, 'services')), (snap) => {
      setStats(prev => ({ ...prev, totalServices: snap.size }));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'services');
    });

    return () => { unsubInvoices(); unsubClients(); unsubServices(); };
  }, [user, loading]);

  const cards = [
    { name: 'Total Pendapatan', value: `Rp ${stats.totalRevenue.toLocaleString('id-ID')}`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { name: 'Total Klien', value: stats.totalClients, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { name: 'Total Jasa', value: stats.totalServices, icon: Briefcase, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { name: 'Invoice Pending', value: stats.pendingInvoices, icon: FileText, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-black text-app-text tracking-tight">Dashboard</h1>
        <p className="text-app-text-muted">Ringkasan bisnis Anda hari ini.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.name} className="bg-app-card p-6 rounded-2xl border border-app-border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className={`${card.bg} ${card.color} p-3 rounded-xl`}>
                  <Icon size={24} />
                </div>
              </div>
              <p className="text-sm font-bold text-app-text-muted uppercase tracking-widest mb-1">{card.name}</p>
              <h3 className="text-2xl font-black text-app-text">{card.value}</h3>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-10">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-app-text tracking-tight">Transaksi Terakhir</h2>
            <button className="text-sm font-bold text-app-text-muted hover:text-app-text uppercase tracking-widest">Lihat Semua</button>
          </div>
          <div className="bg-app-card rounded-2xl border border-app-border overflow-hidden">
            <div className="divide-y divide-app-border/50">
              {recentInvoices.map((invoice) => (
                <div key={invoice.id} className="p-4 flex items-center justify-between hover:bg-app-bg transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={clsx(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      invoice.status === 'paid' ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                    )}>
                      {invoice.status === 'paid' ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                    </div>
                    <div>
                      <p className="font-bold text-app-text">{invoice.clientName}</p>
                      <p className="text-xs text-app-text-muted font-mono">#{invoice.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-app-text">Rp {invoice.total.toLocaleString('id-ID')}</p>
                    <p className="text-xs text-app-text-muted">{format(new Date(invoice.createdAt), 'dd MMM yyyy', { locale: id })}</p>
                  </div>
                </div>
              ))}
              {recentInvoices.length === 0 && (
                <div className="p-12 text-center text-app-text-muted">Belum ada transaksi.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
