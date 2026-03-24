import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, query, addDoc, deleteDoc, doc, updateDoc, handleFirestoreError, OperationType } from '../firebase';
import { Service } from '../types';
import { Plus, Search, Trash2, Edit2, X, Package, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../AuthContext';

export const Services: React.FC = () => {
  const { isAdmin } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({ name: '', price: 0, description: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'services'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
      setServices(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'services'));

    return unsubscribe;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    setIsSubmitting(true);
    setError(null);
    try {
      if (editingService) {
        await updateDoc(doc(db, 'services', editingService.id), formData);
      } else {
        await addDoc(collection(db, 'services'), formData);
      }
      setIsModalOpen(false);
      setEditingService(null);
      setFormData({ name: '', price: 0, description: '' });
    } catch (error: any) {
      setError('Gagal menyimpan jasa. Silakan coba lagi.');
      handleFirestoreError(error, OperationType.WRITE, 'services');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || !serviceToDelete) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'services', serviceToDelete.id));
      setIsDeleteModalOpen(false);
      setServiceToDelete(null);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, 'services');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-app-text tracking-tight">Jasa & Produk</h1>
          <p className="text-app-text-muted">Daftar layanan yang Anda tawarkan.</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => {
              setEditingService(null);
              setFormData({ name: '', price: 0, description: '' });
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-app-primary text-white px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-all"
          >
            <Plus size={20} />
            Tambah Jasa
          </button>
        )}
      </div>

      <div className="bg-app-card rounded-2xl border border-app-border overflow-hidden">
        <div className="p-4 border-b border-app-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
            <input
              type="text"
              placeholder="Cari nama jasa..."
              className="w-full pl-10 pr-4 py-2 bg-app-bg border-none rounded-lg text-sm focus:ring-2 focus:ring-app-primary text-app-text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-app-bg text-app-text-muted text-xs font-bold uppercase tracking-widest">
                <th className="px-6 py-4">Nama Jasa</th>
                <th className="px-6 py-4">Harga</th>
                <th className="px-6 py-4">Deskripsi</th>
                {isAdmin && <th className="px-6 py-4 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {filteredServices.map((service) => (
                <tr key={service.id} className="hover:bg-app-bg transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-app-text">{service.name}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-mono font-bold text-app-text">Rp {service.price.toLocaleString('id-ID')}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-app-text-muted truncate max-w-xs">{service.description}</p>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => {
                            setEditingService(service);
                            setFormData({ name: service.name, price: service.price, description: service.description || '' });
                            setIsModalOpen(true);
                          }}
                          className="p-2 text-app-text-muted hover:text-app-text transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => {
                            setServiceToDelete(service);
                            setIsDeleteModalOpen(true);
                          }}
                          className="p-2 text-app-text-muted hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah/Edit Jasa */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-app-card rounded-2xl w-full max-w-md p-8 border border-app-border shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-app-text">
                {editingService ? 'Edit Jasa' : 'Tambah Jasa'}
              </h2>
              <button onClick={() => { setIsModalOpen(false); setEditingService(null); }} className="text-app-text-muted hover:text-app-text">
                <X size={24} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 text-red-500 rounded-lg flex items-center gap-2 text-sm font-medium">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">Nama Jasa</label>
                <input
                  required
                  type="text"
                  className="w-full px-4 py-2 bg-app-bg border-none rounded-lg focus:ring-2 focus:ring-app-primary text-app-text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">Harga (Rp)</label>
                <input
                  required
                  type="number"
                  className="w-full px-4 py-2 bg-app-bg border-none rounded-lg focus:ring-2 focus:ring-app-primary text-app-text"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">Deskripsi</label>
                <textarea
                  rows={3}
                  className="w-full px-4 py-2 bg-app-bg border-none rounded-lg focus:ring-2 focus:ring-app-primary text-app-text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-app-primary text-white py-3 rounded-xl font-bold hover:opacity-90 transition-all mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  'Simpan Jasa'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-app-card rounded-2xl w-full max-w-sm p-8 text-center border border-app-border shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h2 className="text-xl font-black text-app-text mb-2">Konfirmasi Hapus</h2>
            <p className="text-app-text-muted mb-8 leading-relaxed">
              Apakah Anda yakin ingin menghapus jasa <span className="font-bold text-app-text">{serviceToDelete?.name}</span>? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setIsDeleteModalOpen(false); setServiceToDelete(null); }}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-app-text-muted hover:bg-app-bg transition-all"
                disabled={isDeleting}
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 bg-red-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
    </div>
  );
};
