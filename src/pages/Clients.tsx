import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, query, addDoc, deleteDoc, doc, updateDoc, handleFirestoreError, OperationType } from '../firebase';
import { Client } from '../types';
import { Plus, Search, Trash2, Edit2, X, UserPlus, Loader2, AlertCircle } from 'lucide-react';

export const Clients: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'clients'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'clients'));

    return unsubscribe;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      if (editingClient) {
        await updateDoc(doc(db, 'clients', editingClient.id), formData);
      } else {
        await addDoc(collection(db, 'clients'), formData);
      }
      setIsModalOpen(false);
      setEditingClient(null);
      setFormData({ name: '', email: '', phone: '', address: '' });
    } catch (error: any) {
      setError('Gagal menyimpan klien. Silakan coba lagi.');
      handleFirestoreError(error, OperationType.WRITE, 'clients');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!clientToDelete) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'clients', clientToDelete.id));
      setIsDeleteModalOpen(false);
      setClientToDelete(null);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, 'clients');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-app-text tracking-tight">Klien</h1>
          <p className="text-app-text-muted">Kelola daftar pelanggan Anda.</p>
        </div>
        <button 
          onClick={() => {
            setEditingClient(null);
            setFormData({ name: '', email: '', phone: '', address: '' });
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 bg-app-primary text-white px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-all"
        >
          <UserPlus size={20} />
          Tambah Klien
        </button>
      </div>

      <div className="bg-app-card rounded-2xl border border-app-border overflow-hidden">
        <div className="p-4 border-b border-app-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
            <input
              type="text"
              placeholder="Cari nama atau email..."
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
                <th className="px-6 py-4">Nama</th>
                <th className="px-6 py-4">Kontak</th>
                <th className="px-6 py-4">Alamat</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {filteredClients.map((client) => (
                <tr key={client.id} className="hover:bg-app-bg transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-app-text">{client.name}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-app-text-muted">{client.email}</p>
                    <p className="text-xs text-app-text-muted/60">{client.phone}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-app-text-muted truncate max-w-xs">{client.address}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setEditingClient(client);
                          setFormData({ name: client.name, email: client.email || '', phone: client.phone || '', address: client.address || '' });
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-app-text-muted hover:text-app-text transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => {
                          setClientToDelete(client);
                          setIsDeleteModalOpen(true);
                        }}
                        className="p-2 text-app-text-muted hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah/Edit Klien */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-app-card rounded-2xl w-full max-w-md p-8 border border-app-border shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-app-text">
                {editingClient ? 'Edit Klien' : 'Tambah Klien'}
              </h2>
              <button onClick={() => { setIsModalOpen(false); setEditingClient(null); }} className="text-app-text-muted hover:text-app-text">
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
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">Nama Lengkap</label>
                <input
                  required
                  type="text"
                  className="w-full px-4 py-2 bg-app-bg border-none rounded-lg focus:ring-2 focus:ring-app-primary text-app-text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">Email</label>
                <input
                  type="email"
                  className="w-full px-4 py-2 bg-app-bg border-none rounded-lg focus:ring-2 focus:ring-app-primary text-app-text"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">Telepon</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 bg-app-bg border-none rounded-lg focus:ring-2 focus:ring-app-primary text-app-text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">Alamat</label>
                <textarea
                  rows={3}
                  className="w-full px-4 py-2 bg-app-bg border-none rounded-lg focus:ring-2 focus:ring-app-primary text-app-text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
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
                  'Simpan Klien'
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
              Apakah Anda yakin ingin menghapus klien <span className="font-bold text-app-text">{clientToDelete?.name}</span>? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setIsDeleteModalOpen(false); setClientToDelete(null); }}
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
