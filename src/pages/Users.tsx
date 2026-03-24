import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, query, setDoc, doc, updateDoc, deleteDoc, handleFirestoreError, OperationType, createAuthUser } from '../firebase';
import { UserProfile } from '../types';
import { Plus, Search, Trash2, Edit2, X, UserCog, ShieldCheck, User as UserIcon, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../AuthContext';

export const Users: React.FC = () => {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', role: 'cashier' as 'admin' | 'cashier', password: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data() } as UserProfile));
      setUsers(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return unsubscribe;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    setIsSubmitting(true);
    setError(null);
    try {
      if (editingUser) {
        await updateDoc(doc(db, 'users', editingUser.uid), {
          name: formData.name,
          role: formData.role
        });
      } else {
        // 1. Create Auth User first
        if (!formData.password || formData.password.length < 6) {
          throw new Error('Password minimal 6 karakter.');
        }

        let uid: string;
        try {
          uid = await createAuthUser(formData.email, formData.password);
        } catch (authError: any) {
          if (authError.code === 'auth/email-already-in-use') {
            throw new Error('Email sudah terdaftar di sistem.');
          } else if (authError.code === 'auth/operation-not-allowed') {
            throw new Error('Metode Email/Password belum diaktifkan di Firebase Console.');
          }
          throw authError;
        }

        // 2. Create Firestore Profile
        await setDoc(doc(db, 'users', uid), {
          uid: uid,
          email: formData.email,
          name: formData.name,
          role: formData.role
        });
      }
      setIsModalOpen(false);
      setEditingUser(null);
      setFormData({ name: '', email: '', role: 'cashier', password: '' });
    } catch (error: any) {
      setError(error.message || 'Gagal menyimpan user. Silakan coba lagi.');
      if (!error.message.includes('minimal') && !error.message.includes('terdaftar') && !error.message.includes('diaktifkan')) {
        handleFirestoreError(error, OperationType.WRITE, 'users');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || !userToDelete) return;
    
    setIsDeleting(true);
    try {
      // Note: This only deletes the Firestore profile. 
      // Deleting the Auth user requires Admin SDK (backend).
      await deleteDoc(doc(db, 'users', userToDelete.uid));
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, 'users');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-app-text-muted font-bold">Akses Ditolak. Hanya Admin yang dapat melihat halaman ini.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-app-text tracking-tight">Manajemen User</h1>
          <p className="text-app-text-muted">Kelola akun admin dan kasir.</p>
        </div>
        <button 
          onClick={() => {
            setEditingUser(null);
            setFormData({ name: '', email: '', role: 'cashier', password: '' });
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 bg-app-primary text-white px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-all"
        >
          <UserCog size={20} />
          Tambah User
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
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {filteredUsers.map((u) => (
                <tr key={u.uid} className="hover:bg-app-bg transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-app-bg flex items-center justify-center text-app-text-muted">
                        <UserIcon size={16} />
                      </div>
                      <p className="font-bold text-app-text">{u.name}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-app-text-muted">{u.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase",
                      u.role === 'admin' ? "bg-purple-500/10 text-purple-500" : "bg-blue-500/10 text-blue-500"
                    )}>
                      {u.role === 'admin' && <ShieldCheck size={12} />}
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setEditingUser(u);
                          setFormData({ name: u.name, email: u.email, role: u.role, password: '' });
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-app-text-muted hover:text-app-text transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => {
                          setUserToDelete(u);
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

      {/* Modal Tambah/Edit User */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-app-card rounded-2xl w-full max-w-md p-8 border border-app-border shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-app-text">
                {editingUser ? 'Edit User' : 'Tambah User'}
              </h2>
              <button onClick={() => { setIsModalOpen(false); setEditingUser(null); }} className="text-app-text-muted hover:text-app-text">
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
                  required
                  disabled={!!editingUser}
                  type="email"
                  className="w-full px-4 py-2 bg-app-bg border-none rounded-lg focus:ring-2 focus:ring-app-primary text-app-text disabled:opacity-50"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">Password</label>
                  <div className="relative">
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      placeholder="Minimal 6 karakter"
                      className="w-full px-4 py-2 bg-app-bg border-none rounded-lg focus:ring-2 focus:ring-app-primary text-app-text"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text-muted hover:text-app-text"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">Role</label>
                <select
                  className="w-full px-4 py-2 bg-app-bg border-none rounded-lg focus:ring-2 focus:ring-app-primary text-app-text"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'cashier' })}
                >
                  <option value="cashier">Kasir</option>
                  <option value="admin">Admin</option>
                </select>
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
                  'Simpan User'
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
              Apakah Anda yakin ingin menghapus user <span className="font-bold text-app-text">{userToDelete?.name}</span>? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setIsDeleteModalOpen(false); setUserToDelete(null); }}
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

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
