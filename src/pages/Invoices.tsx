import React, { useState, useEffect, useRef } from 'react';
import { db, collection, onSnapshot, query, addDoc, deleteDoc, doc, updateDoc, handleFirestoreError, OperationType, getDocs, where, limit } from '../firebase';
import { Invoice, Client, Service, InvoiceItem, Voucher } from '../types';
import { Plus, Minus, Search, Trash2, FileText, X, Printer, Send, ExternalLink, CheckCircle2, Clock, Filter, Calendar, AlertTriangle, Loader2, Mail, ChevronDown, Tag, Check } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { InvoiceView } from '../components/InvoiceView';
import { format, isSameDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Invoices: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const { settings } = useSettings();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  
  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'invoice' | 'quotation'>('all');
  const [filterDate, setFilterDate] = useState('');

  // Form State
  const [type, setType] = useState<'invoice' | 'quotation'>('invoice');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedItems, setSelectedItems] = useState<InvoiceItem[]>([]);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null);
  const [isCheckingVoucher, setIsCheckingVoucher] = useState(false);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; type: 'error' | 'success' }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'error'
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsItemDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const unsubInvoices = onSnapshot(query(collection(db, 'invoices')), (snap) => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
    });
    const unsubClients = onSnapshot(query(collection(db, 'clients')), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });
    const unsubServices = onSnapshot(query(collection(db, 'services')), (snap) => {
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Service)));
    });
    return () => { unsubInvoices(); unsubClients(); unsubServices(); };
  }, []);

  const handleAddItem = (service: Service) => {
    const existing = selectedItems.find(i => i.serviceId === service.id);
    if (existing) {
      setSelectedItems(selectedItems.map(i => i.serviceId === service.id ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setSelectedItems([...selectedItems, { serviceId: service.id, name: service.name, price: service.price, qty: 1 }]);
    }
    setItemSearchQuery('');
    setIsItemDropdownOpen(false);
  };

  const handleRemoveItem = (serviceId: string) => {
    setSelectedItems(selectedItems.filter(i => i.serviceId !== serviceId));
  };

  const handleUpdateQty = (serviceId: string, delta: number) => {
    setSelectedItems(selectedItems.map(item => {
      if (item.serviceId === serviceId) {
        const newQty = Math.max(1, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }));
  };

  const totalBeforeDiscount = selectedItems.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);
  
  const discountAmount = appliedVoucher ? (
    appliedVoucher.discountType === 'percentage' 
      ? Math.min(totalBeforeDiscount * (appliedVoucher.discountValue / 100), appliedVoucher.maxDiscount || Infinity)
      : appliedVoucher.discountValue
  ) : 0;

  const total = Math.max(0, totalBeforeDiscount - discountAmount);

  const checkVoucher = async () => {
    if (!voucherCode) return;
    setIsCheckingVoucher(true);
    try {
      const q = query(collection(db, 'vouchers'), where('code', '==', voucherCode.toUpperCase()), limit(1));
      const snap = await getDocs(q);
      
      const logBase = {
        voucherCode: voucherCode.toUpperCase(),
        usedAt: new Date().toISOString(),
        cashierName: profile?.name || 'System',
        invoiceCode: 'Draft', // Since it's not saved yet
      };

      if (snap.empty) {
        setAlertModal({
          isOpen: true,
          title: 'Voucher Tidak Ditemukan',
          message: 'Kode voucher yang Anda masukkan tidak terdaftar dalam sistem.',
          type: 'error'
        });
        setAppliedVoucher(null);
        
        // Record failed log
        await addDoc(collection(db, 'voucher_logs'), {
          ...logBase,
          voucherName: 'Unknown',
          status: 'failed',
          errorMessage: 'Voucher tidak terdaftar.'
        });
      } else {
        const v = { id: snap.docs[0].id, ...snap.docs[0].data() } as Voucher;
        let errorMsg = '';

        if (!v.isActive) {
          errorMsg = 'Voucher sudah tidak aktif.';
        } else if (v.usageCount && v.usageCount >= 1) {
          errorMsg = 'Voucher ini sudah pernah digunakan.';
        } else if (v.expiryDate && new Date(v.expiryDate) < new Date()) {
          errorMsg = 'Voucher sudah kadaluarsa.';
        } else if (v.startDate && new Date(v.startDate) > new Date()) {
          errorMsg = `Voucher baru dapat digunakan mulai tanggal ${format(new Date(v.startDate), 'dd MMM yyyy', { locale: id })}`;
        } else if (v.minPurchase && totalBeforeDiscount < v.minPurchase) {
          errorMsg = `Minimal belanja untuk voucher ini adalah Rp ${v.minPurchase.toLocaleString('id-ID')}`;
        }

        if (errorMsg) {
          setAlertModal({
            isOpen: true,
            title: 'Voucher Tidak Valid',
            message: errorMsg,
            type: 'error'
          });
          // Record failed log
          await addDoc(collection(db, 'voucher_logs'), {
            ...logBase,
            voucherName: v.name,
            status: 'failed',
            errorMessage: errorMsg
          });
          return;
        }

        setAppliedVoucher(v);
        setAlertModal({
          isOpen: true,
          title: 'Voucher Berhasil',
          message: `Voucher "${v.name}" berhasil diterapkan.`,
          type: 'success'
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsCheckingVoucher(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || selectedItems.length === 0) return alert('Pilih klien dan minimal satu jasa.');
    
    const client = clients.find(c => c.id === selectedClientId);
    
    const newInvoice = {
      clientId: selectedClientId,
      clientName: client?.name || 'Unknown',
      items: selectedItems,
      total,
      discountAmount,
      voucherCode: appliedVoucher?.code || null,
      status: 'pending',
      type,
      createdAt: new Date().toISOString(),
      createdBy: profile?.uid || 'system',
      creatorName: profile?.name || 'System'
    };

    try {
      const docRef = await addDoc(collection(db, 'invoices'), newInvoice);
      
      // Update voucher usage count if applied
      if (appliedVoucher) {
        await updateDoc(doc(db, 'vouchers', appliedVoucher.id), {
          usageCount: (appliedVoucher.usageCount || 0) + 1,
          isActive: false
        });

        // Record success log
        await addDoc(collection(db, 'voucher_logs'), {
          voucherName: appliedVoucher.name,
          voucherCode: appliedVoucher.code,
          usedAt: new Date().toISOString(),
          cashierName: profile?.name || 'System',
          invoiceCode: docRef.id.slice(0, 8).toUpperCase(), // Using a short version of ID as code
          status: 'success'
        });
      }

      const savedInvoice = { id: docRef.id, ...newInvoice } as Invoice;
      setIsModalOpen(false);
      resetForm();
      
      // Automatically trigger email sharing
      setTimeout(() => {
        handleShareEmail(savedInvoice);
      }, 500);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'invoices');
    }
  };

  const resetForm = () => {
    setSelectedClientId('');
    setSelectedItems([]);
    setItemSearchQuery('');
    setIsItemDropdownOpen(false);
    setVoucherCode('');
    setAppliedVoucher(null);
    setType('invoice');
  };

  const handleStatusChange = async (invoice: Invoice, status: 'paid' | 'cancelled') => {
    try {
      await updateDoc(doc(db, 'invoices', invoice.id), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'invoices');
    }
  };

  const openDeleteModal = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!invoiceToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'invoices', invoiceToDelete.id));
      setIsDeleteModalOpen(false);
      setInvoiceToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'invoices');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleShareWhatsApp = (invoice: Invoice) => {
    const client = clients.find(c => c.id === invoice.clientId);
    if (!client?.phone) return alert('Nomor telepon klien tidak tersedia.');
    
    const publicUrl = `${window.location.origin}/public/invoice/${invoice.id}`;
    const message = `Halo ${client.name}, berikut adalah ${invoice.type === 'invoice' ? 'invoice' : 'penawaran'} Anda: ${publicUrl}`;
    window.open(`https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleShareEmail = async (invoice: Invoice) => {
    const client = clients.find(c => c.id === invoice.clientId);
    if (!client?.email) return;

    const publicUrl = `${window.location.origin}/public/invoice/${invoice.id}`;
    const storeName = settings.appName || 'JasaPro';
    const docType = invoice.type === 'invoice' ? 'Invoice' : 'Penawaran';
    
    try {
      const response = await fetch('/api/send-invoice-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: client.email,
          clientName: client.name,
          invoiceType: invoice.type,
          invoiceId: invoice.id,
          publicUrl,
          appName: storeName
        })
      });

      if (!response.ok) {
        const err = await response.json();
        console.error("Email failed:", err);
        // Fallback to mailto if server fails or key is missing
        const subject = `[OFFICIAL] ${docType} #${invoice.id.slice(0, 8).toUpperCase()} - ${storeName}`;
        const body = `Halo ${client.name},\n\nTerima kasih telah menggunakan layanan ${storeName}.\n\nBerikut adalah ${docType} resmi Anda yang dapat diakses, diunduh, dan dicetak melalui tautan digital di bawah ini:\n\nLihat Dokumen Digital: ${publicUrl}\n\nJika ada pertanyaan, silakan hubungi kami.\n\nHormat kami,\nTim ${storeName}`;
        window.location.href = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      } else {
        console.log("Email sent successfully via server");
      }
    } catch (error) {
      console.error("Email API error:", error);
    }
  };

  const filteredInvoices = invoices
    .filter(inv => {
      const matchesSearch = inv.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           inv.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'all' || inv.type === filterType;
      const matchesDate = !filterDate || isSameDay(new Date(inv.createdAt), new Date(filterDate));
      return matchesSearch && matchesType && matchesDate;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-app-text tracking-tight">Invoice & Penawaran</h1>
          <p className="text-app-text-muted">Kelola transaksi dan penawaran jasa.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center justify-center gap-2 bg-app-primary text-white px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-all"
        >
          <Plus size={20} />
          Buat Baru
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-app-card p-4 rounded-2xl border border-app-border shadow-sm space-y-4 md:space-y-0 md:flex md:items-center md:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
          <input 
            type="text"
            placeholder="Cari klien atau ID..."
            className="w-full pl-12 pr-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary text-app-text transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap gap-4">
          <div className="relative min-w-[140px]">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={16} />
            <select 
              className="w-full pl-10 pr-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary appearance-none text-sm font-bold text-app-text"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
            >
              <option value="all">Semua Tipe</option>
              <option value="invoice">Invoice</option>
              <option value="quotation">Penawaran</option>
            </select>
          </div>

          <div className="relative min-w-[160px]">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={16} />
            <input 
              type="date"
              className="w-full pl-10 pr-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary text-sm font-bold text-app-text"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>

          {(searchQuery || filterType !== 'all' || filterDate) && (
            <button 
              onClick={() => { setSearchQuery(''); setFilterType('all'); setFilterDate(''); }}
              className="text-xs font-black text-red-500 uppercase tracking-widest hover:text-red-600 px-2"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {filteredInvoices.map(invoice => (
          <div key={invoice.id} className="bg-app-card rounded-2xl border border-app-border p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-lg transition-all">
            <div className="flex items-center gap-4">
              <div className={clsx(
                "w-12 h-12 rounded-xl flex items-center justify-center",
                invoice.type === 'invoice' ? "bg-blue-500/10 text-blue-500" : "bg-purple-500/10 text-purple-500"
              )}>
                <FileText size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-app-text">{invoice.clientName}</span>
                  <span className={clsx(
                    "text-[10px] font-black uppercase px-2 py-0.5 rounded",
                    invoice.type === 'invoice' ? "bg-blue-500/20 text-blue-500" : "bg-purple-500/20 text-purple-500"
                  )}>
                    {invoice.type}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-app-text-muted">
                  <span className="font-mono">#{invoice.id.slice(0, 8).toUpperCase()}</span>
                  <span>•</span>
                  <span>{format(new Date(invoice.createdAt), 'dd MMM yyyy', { locale: id })}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:items-end gap-2">
              <p className="text-xl font-black text-app-text">Rp {invoice.total.toLocaleString('id-ID')}</p>
              <div className="flex items-center gap-4">
                <span className={clsx(
                  "flex items-center gap-1.5 text-xs font-bold uppercase",
                  invoice.status === 'paid' ? "text-emerald-500" : invoice.status === 'cancelled' ? "text-red-500" : "text-amber-500"
                )}>
                  {invoice.status === 'paid' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                  {invoice.status}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setViewingInvoice(invoice)} className="p-2 text-app-text-muted hover:text-app-text transition-colors" title="Lihat">
                    <ExternalLink size={18} />
                  </button>
                  <button onClick={() => handleShareWhatsApp(invoice)} className="p-2 text-app-text-muted hover:text-emerald-500 transition-colors" title="WhatsApp">
                    <Send size={18} />
                  </button>
                  <button onClick={() => handleShareEmail(invoice)} className="p-2 text-app-text-muted hover:text-blue-500 transition-colors" title="Email">
                    <Mail size={18} />
                  </button>
                  {invoice.status === 'pending' && (
                    <button onClick={() => handleStatusChange(invoice, 'paid')} className="p-2 text-app-text-muted hover:text-emerald-500 transition-colors" title="Tandai Lunas">
                      <CheckCircle2 size={18} />
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => openDeleteModal(invoice)} className="p-2 text-app-text-muted hover:text-red-500 transition-colors" title="Hapus">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {filteredInvoices.length === 0 && (
          <div className="bg-app-bg rounded-2xl border-2 border-dashed border-app-border p-12 text-center">
            <Search size={48} className="mx-auto text-app-text-muted opacity-20 mb-4" />
            <p className="text-app-text-muted font-bold">Tidak ada dokumen ditemukan.</p>
            <p className="text-app-text-muted/60 text-sm">Coba ubah kata kunci atau filter Anda.</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-app-card rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 border border-app-border">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} />
              </div>
              <h2 className="text-xl font-black text-app-text mb-2">Konfirmasi Hapus</h2>
              <p className="text-app-text-muted leading-relaxed">
                Apakah Anda yakin ingin menghapus <span className="font-bold text-app-text">{invoiceToDelete?.type}</span> untuk <span className="font-bold text-app-text">{invoiceToDelete?.clientName}</span>? Tindakan ini tidak dapat dibatalkan.
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

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-app-card rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-app-border">
            <div className="p-8 border-b border-app-border flex justify-between items-center">
              <h2 className="text-2xl font-black text-app-text">Buat Dokumen Baru</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-app-text-muted hover:text-app-text">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-3 tracking-widest">Tipe Dokumen</label>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setType('invoice')}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold border-2 transition-all",
                        type === 'invoice' ? "border-app-primary bg-app-primary text-white" : "border-app-border text-app-text-muted"
                      )}
                    >
                      Invoice
                    </button>
                    <button 
                      onClick={() => setType('quotation')}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold border-2 transition-all",
                        type === 'quotation' ? "border-app-primary bg-app-primary text-white" : "border-app-border text-app-text-muted"
                      )}
                    >
                      Penawaran
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-3 tracking-widest">Pilih Klien</label>
                  <select 
                    className="w-full px-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary text-app-text"
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                  >
                    <option value="">-- Pilih Klien --</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-3 tracking-widest">Pilih Jasa/Barang</label>
                  <div className="relative" ref={dropdownRef}>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                      <input 
                        type="text"
                        placeholder="Cari jasa atau barang..."
                        className="w-full pl-12 pr-10 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary text-app-text transition-all"
                        value={itemSearchQuery}
                        onChange={(e) => {
                          setItemSearchQuery(e.target.value);
                          setIsItemDropdownOpen(true);
                        }}
                        onFocus={() => setIsItemDropdownOpen(true)}
                      />
                      <ChevronDown 
                        className={cn(
                          "absolute right-4 top-1/2 -translate-y-1/2 text-app-text-muted transition-transform cursor-pointer",
                          isItemDropdownOpen && "rotate-180"
                        )} 
                        size={18}
                        onClick={() => setIsItemDropdownOpen(!isItemDropdownOpen)}
                      />
                    </div>

                    {isItemDropdownOpen && (
                      <div className="absolute z-[80] left-0 right-0 mt-2 bg-app-card border border-app-border rounded-xl shadow-xl max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                        {services
                          .filter(s => s.name.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                          .map(s => (
                            <button 
                              key={s.id}
                              onClick={() => handleAddItem(s)}
                              className="w-full flex items-center justify-between p-4 hover:bg-app-bg transition-colors text-left border-b border-app-border last:border-none"
                            >
                              <div>
                                <p className="font-bold text-app-text">{s.name}</p>
                                <p className="text-xs text-app-text-muted">Rp {s.price.toLocaleString('id-ID')}</p>
                              </div>
                              <Plus size={18} className="text-app-text-muted" />
                            </button>
                          ))}
                        {services.filter(s => s.name.toLowerCase().includes(itemSearchQuery.toLowerCase())).length === 0 && (
                          <div className="p-8 text-center">
                            <p className="text-sm text-app-text-muted italic">Tidak ada jasa/barang ditemukan.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-app-bg rounded-2xl p-6 flex flex-col">
                <h3 className="text-xs font-bold text-app-text-muted uppercase mb-6 tracking-widest">Ringkasan Item</h3>
                <div className="flex-1 space-y-4 mb-6">
                  {selectedItems.map(item => (
                    <div key={item.serviceId} className="bg-app-card p-4 rounded-xl shadow-sm space-y-3 border border-app-border">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-app-text">{item.name}</p>
                          <p className="text-xs text-app-text-muted">Rp {item.price.toLocaleString('id-ID')}</p>
                        </div>
                        <button onClick={() => handleRemoveItem(item.serviceId)} className="text-app-text-muted hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="flex items-center justify-between pt-2 border-t border-app-border">
                        <div className="flex items-center gap-3 bg-app-bg rounded-lg p-1">
                          <button 
                            onClick={() => handleUpdateQty(item.serviceId, -1)}
                            className="w-7 h-7 flex items-center justify-center bg-app-card rounded-md text-app-text hover:bg-app-bg transition-all shadow-sm disabled:opacity-30 border border-app-border"
                            disabled={item.qty <= 1}
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-black text-app-text w-6 text-center">{item.qty}</span>
                          <button 
                            onClick={() => handleUpdateQty(item.serviceId, 1)}
                            className="w-7 h-7 flex items-center justify-center bg-app-card rounded-md text-app-text hover:bg-app-bg transition-all shadow-sm border border-app-border"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <p className="font-black text-app-text">Rp {(item.price * item.qty).toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                  ))}
                  {selectedItems.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-app-text-muted py-12">
                      <FileText size={48} className="mb-4 opacity-20" />
                      <p className="text-sm font-medium">Belum ada item terpilih</p>
                    </div>
                  )}
                </div>

                {type === 'invoice' && (
                  <div className="mb-6 pt-6 border-t border-app-border">
                    <label className="block text-xs font-bold text-app-text-muted uppercase mb-3 tracking-widest">Kode Voucher</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                        <input 
                          type="text"
                          placeholder="Masukkan kode voucher..."
                          className="w-full pl-12 pr-4 py-3 bg-app-card border border-app-border rounded-xl focus:ring-2 focus:ring-app-primary font-bold uppercase text-app-text"
                          value={voucherCode}
                          onChange={(e) => setVoucherCode(e.target.value)}
                          disabled={!!appliedVoucher}
                        />
                        {appliedVoucher && (
                          <Check className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500" size={18} />
                        )}
                      </div>
                      {appliedVoucher ? (
                        <button 
                          onClick={() => { setAppliedVoucher(null); setVoucherCode(''); }}
                          className="px-4 py-3 bg-red-500/10 text-red-500 rounded-xl font-bold hover:bg-red-500/20 transition-all"
                        >
                          Hapus
                        </button>
                      ) : (
                        <button 
                          onClick={checkVoucher}
                          disabled={isCheckingVoucher || !voucherCode}
                          className="px-6 py-3 bg-app-primary text-white rounded-xl font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {isCheckingVoucher ? <Loader2 size={18} className="animate-spin" /> : 'Gunakan'}
                        </button>
                      )}
                    </div>
                    {appliedVoucher && (
                      <p className="mt-2 text-xs font-bold text-emerald-500">
                        Voucher berhasil digunakan! Potongan: Rp {discountAmount.toLocaleString('id-ID')}
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-6 border-t border-app-border">
                  <div className="space-y-2 mb-6">
                    {discountAmount > 0 && (
                      <div className="flex justify-between items-center text-app-text-muted">
                        <span className="text-xs font-bold uppercase tracking-widest">Subtotal</span>
                        <span className="font-bold">Rp {totalBeforeDiscount.toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    {discountAmount > 0 && (
                      <div className="flex justify-between items-center text-emerald-500">
                        <span className="text-xs font-bold uppercase tracking-widest">Diskon</span>
                        <span className="font-bold">- Rp {discountAmount.toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-app-text-muted uppercase tracking-widest">Total</span>
                      <span className="text-3xl font-black text-app-text">Rp {total.toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                  <button 
                    onClick={handleSubmit}
                    className="w-full bg-app-primary text-white py-4 rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-app-primary/20"
                  >
                    Simpan & Terbitkan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Modal */}
      {alertModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-app-card rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 border border-app-border">
            <div className="p-8 text-center">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6",
                alertModal.type === 'success' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
              )}>
                {alertModal.type === 'success' ? <CheckCircle2 size={32} /> : <AlertTriangle size={32} />}
              </div>
              <h2 className="text-xl font-black text-app-text mb-2">{alertModal.title}</h2>
              <p className="text-app-text-muted leading-relaxed">
                {alertModal.message}
              </p>
            </div>
            <div className="p-6 bg-app-bg">
              <button 
                onClick={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-white transition-all shadow-lg",
                  alertModal.type === 'success' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20" : "bg-app-primary hover:opacity-90 shadow-app-primary/20"
                )}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-app-card rounded-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col border border-app-border">
            <div className="p-6 border-b border-app-border flex justify-between items-center bg-app-bg">
              <div className="flex items-center gap-4">
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-app-card border border-app-border px-4 py-2 rounded-lg text-sm font-bold text-app-text hover:bg-app-bg transition-all">
                  <Printer size={16} /> Cetak
                </button>
                <button onClick={() => handleShareWhatsApp(viewingInvoice)} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all">
                  <Send size={16} /> WhatsApp
                </button>
                <button onClick={() => handleShareEmail(viewingInvoice)} className="flex items-center gap-2 bg-app-primary text-white px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition-all">
                  <Send size={16} /> Email
                </button>
              </div>
              <button onClick={() => setViewingInvoice(null)} className="text-app-text-muted hover:text-app-text">
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-12 bg-app-bg">
              <InvoiceView 
                invoice={viewingInvoice} 
                client={clients.find(c => c.id === viewingInvoice.clientId)} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
