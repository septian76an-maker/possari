import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, query, orderBy, handleFirestoreError, OperationType } from '../firebase';
import { Voucher } from '../types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { clsx } from 'clsx';
import { BarChart3, Search, Tag, CheckCircle2, Clock, Hash } from 'lucide-react';
import { useAuth } from '../AuthContext';

export const VoucherStats: React.FC = () => {
  const { user, loading } = useAuth();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (loading || !user) return;
    const unsub = onSnapshot(
      query(collection(db, 'vouchers'), orderBy('createdAt', 'desc')),
      (snap) => {
        setVouchers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Voucher)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'vouchers')
    );
    return () => unsub();
  }, [user, loading]);

  interface CampaignStat {
    name: string;
    createdAt: string;
    total: number;
    used: number;
    unused: number;
  }

  // Group vouchers by campaign (name + createdAt)
  const groupedVouchers = vouchers.reduce((acc, v) => {
    const key = `${v.name}_${v.createdAt}`;
    if (!acc[key]) {
      acc[key] = {
        name: v.name,
        createdAt: v.createdAt,
        total: 0,
        used: 0,
        unused: 0
      };
    }
    acc[key].total += 1;
    if (v.usageCount > 0) {
      acc[key].used += 1;
    } else {
      acc[key].unused += 1;
    }
    return acc;
  }, {} as Record<string, CampaignStat>);

  const stats = (Object.values(groupedVouchers) as CampaignStat[]).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filteredStats = stats.filter(stat => 
    stat.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-black text-app-text tracking-tight">Data Voucher</h1>
          <p className="text-app-text-muted">Statistik penggunaan voucher per kampanye.</p>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
          <input 
            type="text"
            placeholder="Cari nama kampanye..."
            className="w-full pl-12 pr-4 py-3 bg-app-card border-2 border-app-border rounded-xl focus:ring-2 focus:ring-app-primary font-bold transition-all text-app-text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-app-card p-6 rounded-2xl border-2 border-app-border shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-app-primary rounded-xl flex items-center justify-center text-white">
              <Hash size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-app-text-muted uppercase tracking-widest">Total Voucher</p>
              <h2 className="text-2xl font-black text-app-text">{vouchers.length}</h2>
            </div>
          </div>
        </div>
        <div className="bg-app-card p-6 rounded-2xl border-2 border-app-border shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-app-text-muted uppercase tracking-widest">Sudah Digunakan</p>
              <h2 className="text-2xl font-black text-emerald-500">{vouchers.filter(v => v.usageCount > 0).length}</h2>
            </div>
          </div>
        </div>
        <div className="bg-app-card p-6 rounded-2xl border-2 border-app-border shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-app-bg rounded-xl flex items-center justify-center text-app-text-muted">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-app-text-muted uppercase tracking-widest">Belum Digunakan</p>
              <h2 className="text-2xl font-black text-app-text">{vouchers.filter(v => v.usageCount === 0).length}</h2>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-app-card rounded-2xl border-2 border-app-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-app-bg border-b-2 border-app-border">
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Nama Kampanye</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Tgl Dibuat</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest text-center">Jumlah Voucher</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest text-center">Belum Digunakan</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest text-center">Sudah Digunakan</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Persentase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {filteredStats.map((stat, idx) => {
                const percentage = Math.round((stat.used / stat.total) * 100);
                return (
                  <tr key={`${stat.name}_${idx}`} className="hover:bg-app-bg/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-app-bg rounded-lg flex items-center justify-center text-app-text-muted">
                          <Tag size={16} />
                        </div>
                        <span className="font-bold text-app-text">{stat.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-app-text-muted font-medium">
                      {format(new Date(stat.createdAt), 'dd MMM yyyy', { locale: id })}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-app-text">
                      {stat.total}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-3 py-1 bg-app-bg text-app-text-muted rounded-full text-xs font-bold">
                        {stat.unused}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-xs font-bold">
                        {stat.used}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-app-bg rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-black text-app-text w-10">{percentage}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <BarChart3 size={48} className="mx-auto text-app-text-muted opacity-20 mb-4" />
                    <p className="text-app-text-muted font-bold">Belum ada data voucher.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
