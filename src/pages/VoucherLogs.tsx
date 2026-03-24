import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, query, orderBy, handleFirestoreError, OperationType } from '../firebase';
import { VoucherLog } from '../types';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { clsx } from 'clsx';
import { FileText, Search, CheckCircle2, XCircle, Clock, User, Hash } from 'lucide-react';

export const VoucherLogs: React.FC = () => {
  const [logs, setLogs] = useState<VoucherLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'voucher_logs'), orderBy('usedAt', 'desc')),
      (snap) => {
        setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VoucherLog)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'voucher_logs')
    );
    return () => unsub();
  }, []);

  const filteredLogs = logs.filter(log => 
    log.voucherName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.voucherCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.invoiceCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.cashierName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-black text-app-text tracking-tight">Log Voucher</h1>
          <p className="text-app-text-muted">Riwayat penggunaan voucher oleh pelanggan.</p>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
          <input 
            type="text"
            placeholder="Cari voucher, kode, atau kasir..."
            className="w-full pl-12 pr-4 py-3 bg-app-card border-2 border-app-border rounded-xl focus:ring-2 focus:ring-app-primary font-bold transition-all text-app-text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-app-card rounded-2xl border-2 border-app-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-app-bg border-b-2 border-app-border">
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Waktu Penggunaan</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Voucher</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Kasir</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Invoice</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-app-bg/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-app-text font-bold">
                      <Clock size={14} className="text-app-text-muted" />
                      {format(new Date(log.usedAt), 'dd MMM yyyy, HH:mm', { locale: id })}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-app-text">{log.voucherName}</p>
                    <p className="text-xs text-app-text-muted font-mono uppercase tracking-wider">{log.voucherCode}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-app-text-muted font-medium">
                      <User size={14} className="text-app-text-muted" />
                      {log.cashierName}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-app-text font-bold">
                      <Hash size={14} className="text-app-text-muted" />
                      {log.invoiceCode}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={clsx(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      log.status === 'success' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                    )}>
                      {log.status === 'success' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {log.status === 'success' ? 'Berhasil' : 'Gagal'}
                    </div>
                    {log.errorMessage && (
                      <p className="text-[10px] text-red-400 mt-1 italic">{log.errorMessage}</p>
                    )}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <FileText size={48} className="mx-auto text-app-text-muted opacity-20 mb-4" />
                    <p className="text-app-text-muted font-bold">Belum ada log penggunaan voucher.</p>
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
