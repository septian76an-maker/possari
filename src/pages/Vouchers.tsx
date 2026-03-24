import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, query, addDoc, deleteDoc, doc, updateDoc, handleFirestoreError, OperationType, writeBatch } from '../firebase';
import { Voucher } from '../types';
import { Plus, Trash2, Tag, X, CheckCircle2, XCircle, Loader2, AlertTriangle, Calendar, Percent, Banknote, Download, Hash } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { clsx } from 'clsx';
import { useAuth } from '../AuthContext';
import * as XLSX from 'xlsx';

export const Vouchers: React.FC = () => {
  const { isAdmin } = useAuth();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<VoucherBatch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [minPurchase, setMinPurchase] = useState<number>(0);
  const [maxDiscount, setMaxDiscount] = useState<number>(0);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState<number>(1);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'vouchers')), (snap) => {
      setVouchers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Voucher)));
    });
    return () => unsub();
  }, []);

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || discountValue <= 0 || quantity <= 0) return alert('Lengkapi data voucher.');
    
    setIsLoading(true);
    const batch = writeBatch(db);
    const generatedVouchers: any[] = [];

    try {
      const createdAt = new Date().toISOString();
      for (let i = 0; i < quantity; i++) {
        const code = generateRandomCode();
        const voucherData = {
          name,
          code,
          discountType,
          discountValue,
          minPurchase: minPurchase || 0,
          maxDiscount: maxDiscount || 0,
          startDate: startDate || null,
          expiryDate: expiryDate || null,
          isActive: true,
          usageCount: 0,
          createdAt
        };
        
        const newDocRef = doc(collection(db, 'vouchers'));
        batch.set(newDocRef, voucherData);
        generatedVouchers.push({ id: newDocRef.id, ...voucherData });
      }

      await batch.commit();
      
      if (window.confirm(`${quantity} voucher berhasil dibuat. Download daftar kode dalam format Excel?`)) {
        downloadAsExcel(generatedVouchers, name);
      }

      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'vouchers');
    } finally {
      setIsLoading(false);
    }
  };

  type VoucherBatch = Voucher & { count: number; usedCount: number; codes: Voucher[] };

  const groupedVouchers = vouchers.reduce((acc, v) => {
    const key = `${v.name}_${v.createdAt}`;
    if (!acc[key]) {
      acc[key] = {
        ...v,
        count: 0,
        usedCount: 0,
        codes: [] as Voucher[]
      };
    }
    acc[key].count += 1;
    if (v.usageCount > 0) acc[key].usedCount += 1;
    acc[key].codes.push(v);
    return acc;
  }, {} as Record<string, VoucherBatch>);

  const voucherBatches = (Object.values(groupedVouchers) as VoucherBatch[]).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const downloadBatch = (batch: VoucherBatch) => {
    downloadAsExcel(batch.codes, batch.name);
  };

  const downloadAsExcel = (data: Voucher[], fileName?: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data.map(v => ({
      'Nama Voucher': v.name,
      'Kode Voucher': v.code,
      'Tipe Diskon': v.discountType === 'percentage' ? 'Persen' : 'Tetap',
      'Nilai Diskon': v.discountValue,
      'Min. Belanja': v.minPurchase,
      'Maks. Diskon': v.maxDiscount,
      'Tanggal Mulai': v.startDate ? format(new Date(v.startDate), 'dd/MM/yyyy') : '-',
      'Tanggal Kadaluarsa': v.expiryDate ? format(new Date(v.expiryDate), 'dd/MM/yyyy') : '-',
    })));
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vouchers");
    XLSX.writeFile(workbook, `Vouchers_${fileName || 'Export'}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const resetForm = () => {
    setName('');
    setDiscountType('percentage');
    setDiscountValue(0);
    setMinPurchase(0);
    setMaxDiscount(0);
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setExpiryDate('');
    setQuantity(1);
  };

  const toggleStatus = async (batch: VoucherBatch) => {
    const newStatus = !batch.isActive;
    setIsLoading(true);
    try {
      const batchOp = writeBatch(db);
      batch.codes.forEach(v => {
        batchOp.update(doc(db, 'vouchers', v.id), { isActive: newStatus });
      });
      await batchOp.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'vouchers');
    } finally {
      setIsLoading(false);
    }
  };

  const openDeleteModal = (batch: VoucherBatch) => {
    setBatchToDelete(batch);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!batchToDelete) return;
    setIsDeleting(true);
    try {
      const batchOp = writeBatch(db);
      batchToDelete.codes.forEach(v => {
        batchOp.delete(doc(db, 'vouchers', v.id));
      });
      await batchOp.commit();
      setIsDeleteModalOpen(false);
      setBatchToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'vouchers');
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteBatch = async (batch: VoucherBatch) => {
    openDeleteModal(batch);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-black text-app-text tracking-tight">Voucher & Diskon</h1>
          <p className="text-app-text-muted">Kelola kampanye promo Anda dalam satu baris data.</p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center gap-2 bg-app-primary text-white px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-all"
            >
              <Plus size={20} />
              Buat Kampanye Voucher
            </button>
          )}
        </div>
      </div>

      <div className="bg-app-card rounded-2xl border-2 border-app-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-app-bg border-b-2 border-app-border">
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Nama Voucher</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Diskon</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest text-center">Jumlah Kode</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Periode</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-app-text-muted uppercase tracking-widest text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {voucherBatches.map(batch => (
                <tr key={`${batch.name}_${batch.createdAt}`} className={clsx(
                  "hover:bg-app-bg transition-colors",
                  !batch.isActive && "opacity-60"
                )}>
                  <td className="px-6 py-4">
                    <p className="font-bold text-app-text">{batch.name}</p>
                    <p className="text-[10px] text-app-text-muted font-mono uppercase">Dibuat: {format(new Date(batch.createdAt), 'dd/MM/yy HH:mm')}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-app-text">
                      {batch.discountType === 'percentage' ? `${batch.discountValue}%` : `Rp ${batch.discountValue.toLocaleString('id-ID')}`}
                    </span>
                    <p className="text-[10px] text-app-text-muted">Min: Rp {batch.minPurchase?.toLocaleString('id-ID') || 0}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="bg-app-bg text-app-text px-3 py-1 rounded-full text-xs font-bold">
                        {batch.count} Kode
                      </span>
                      <span className="text-[10px] font-bold text-app-text-muted">
                        Terpakai: {batch.usedCount}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs space-y-0.5">
                      <p className="text-app-text-muted">Mulai: {batch.startDate ? format(new Date(batch.startDate), 'dd MMM yyyy', { locale: id }) : '-'}</p>
                      <p className="text-red-500 font-medium">Selesai: {batch.expiryDate ? format(new Date(batch.expiryDate), 'dd MMM yyyy', { locale: id }) : '-'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => toggleStatus(batch)}
                      className={clsx(
                        "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                        batch.isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-app-bg text-app-text-muted"
                      )}
                    >
                      {batch.isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {batch.isActive ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => downloadBatch(batch)}
                        className="p-2 text-app-text-muted hover:text-app-text hover:bg-app-bg rounded-lg transition-all"
                        title="Download Excel"
                      >
                        <Download size={18} />
                      </button>
                      {isAdmin && (
                        <button 
                          onClick={() => deleteBatch(batch)}
                          className="p-2 text-app-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                          title="Hapus Batch"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {voucherBatches.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Tag size={48} className="mx-auto text-app-text-muted opacity-20 mb-4" />
                    <p className="text-app-text font-bold">Belum ada kampanye voucher.</p>
                    <p className="text-app-text-muted text-sm">Buat kampanye pertama Anda untuk menarik pelanggan.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-app-card rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 border border-app-border">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} />
              </div>
              <h2 className="text-xl font-black text-app-text mb-2">Konfirmasi Hapus</h2>
              <p className="text-app-text-muted leading-relaxed">
                Apakah Anda yakin ingin menghapus seluruh batch <span className="font-bold text-app-text">"{batchToDelete?.name}"</span> yang berisi <span className="font-bold text-app-text">{batchToDelete?.count} kode</span>? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="p-6 bg-app-bg flex gap-4">
              <button 
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 py-3 bg-app-card border border-app-border rounded-xl font-bold text-app-text-muted hover:bg-app-bg transition-all disabled:opacity-50"
              >
                Batal
              </button>
              <button 
                disabled={isDeleting}
                onClick={confirmDelete}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Menghapus...
                  </>
                ) : (
                  'Ya, Hapus'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-app-card rounded-2xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] border border-app-border">
            <div className="p-6 border-b border-app-border flex justify-between items-center">
              <h2 className="text-xl font-black text-app-text">Buat Voucher Massal</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-app-text-muted hover:text-app-text">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Nama Voucher</label>
                <input 
                  type="text"
                  className="w-full px-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary font-bold text-app-text"
                  placeholder="Misal: Promo Ramadhan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Tipe Diskon</label>
                  <div className="flex bg-app-bg p-1 rounded-xl">
                    <button 
                      type="button"
                      onClick={() => setDiscountType('percentage')}
                      className={clsx(
                        "flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1",
                        discountType === 'percentage' ? "bg-app-card text-app-text shadow-sm" : "text-app-text-muted"
                      )}
                    >
                      <Percent size={14} /> Persen
                    </button>
                    <button 
                      type="button"
                      onClick={() => setDiscountType('fixed')}
                      className={clsx(
                        "flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1",
                        discountType === 'fixed' ? "bg-app-card text-app-text shadow-sm" : "text-app-text-muted"
                      )}
                    >
                      <Banknote size={14} /> Tetap
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Nilai Diskon</label>
                  <input 
                    type="number"
                    className="w-full px-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary font-bold text-app-text"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Tanggal Mulai</label>
                  <input 
                    type="date"
                    className="w-full px-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary font-bold text-app-text"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Tanggal Kadaluarsa</label>
                  <input 
                    type="date"
                    className="w-full px-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary font-bold text-app-text"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Min. Belanja</label>
                  <input 
                    type="number"
                    className="w-full px-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary font-bold text-app-text"
                    value={minPurchase}
                    onChange={(e) => setMinPurchase(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Jumlah Voucher</label>
                  <div className="relative">
                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                    <input 
                      type="number"
                      className="w-full pl-12 pr-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary font-bold text-app-text"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      min="1"
                      max="100"
                      required
                    />
                  </div>
                </div>
              </div>

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full bg-app-primary text-white py-4 rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-app-primary/20 flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : 'Generate & Simpan'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
