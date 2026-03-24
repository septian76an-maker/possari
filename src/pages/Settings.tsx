import React, { useState } from 'react';
import { useSettings } from '../SettingsContext';
import { useAuth } from '../AuthContext';
import { Save, Building2, MapPin, Phone, Mail, Image as ImageIcon, CheckCircle2, CreditCard, Plus, Trash2, Palette, Sun, Moon, Waves } from 'lucide-react';
import { clsx } from 'clsx';

export const Settings: React.FC = () => {
  const { isAdmin } = useAuth();
  const { settings, updateSettings } = useSettings();
  const [formData, setFormData] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    setIsSaving(true);
    try {
      await updateSettings(formData);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const addBankAccount = () => {
    const currentAccounts = formData.bankAccounts || [];
    setFormData({
      ...formData,
      bankAccounts: [...currentAccounts, { bankName: '', accountNumber: '', accountHolder: '' }]
    });
  };

  const removeBankAccount = (index: number) => {
    const currentAccounts = formData.bankAccounts || [];
    setFormData({
      ...formData,
      bankAccounts: currentAccounts.filter((_, i) => i !== index)
    });
  };

  const updateBankAccount = (index: number, field: string, value: string) => {
    const currentAccounts = [...(formData.bankAccounts || [])];
    currentAccounts[index] = { ...currentAccounts[index], [field]: value };
    setFormData({ ...formData, bankAccounts: currentAccounts });
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-app-text-muted font-bold">Akses Ditolak. Hanya Admin yang dapat mengubah pengaturan.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-app-text tracking-tight">Pengaturan Aplikasi</h1>
        <p className="text-app-text-muted">Sesuaikan identitas bisnis Anda pada invoice dan aplikasi.</p>
      </div>

      <div className="bg-app-card rounded-2xl border border-app-border overflow-hidden shadow-sm">
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <h3 className="text-sm font-black text-app-text uppercase tracking-widest border-b border-app-border/50 pb-2">Identitas Bisnis</h3>
              
              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Nama Aplikasi / Bisnis</label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                  <input
                    required
                    type="text"
                    className="w-full pl-12 pr-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text"
                    value={formData.appName}
                    onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">URL Logo (Opsional)</label>
                <div className="relative">
                  <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                  <input
                    type="text"
                    placeholder="https://example.com/logo.png"
                    className="w-full pl-12 pr-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text"
                    value={formData.appLogo}
                    onChange={(e) => setFormData({ ...formData, appLogo: e.target.value })}
                  />
                </div>
                <p className="mt-2 text-[10px] text-app-text-muted">Gunakan URL gambar publik untuk logo Anda.</p>
              </div>

              <div className="pt-4">
                <div className="flex items-center justify-between border-b border-app-border/50 pb-2 mb-4">
                  <h3 className="text-sm font-black text-app-text uppercase tracking-widest">Informasi Pembayaran</h3>
                  <button
                    type="button"
                    onClick={addBankAccount}
                    className="flex items-center gap-1 text-[10px] font-black uppercase bg-app-bg px-2 py-1 rounded hover:bg-app-border transition-colors text-app-text"
                  >
                    <Plus size={12} /> Tambah
                  </button>
                </div>
                
                <div className="space-y-4">
                  {(formData.bankAccounts || []).map((account, index) => (
                    <div key={index} className="p-4 bg-app-bg rounded-xl space-y-3 relative group">
                      <button
                        type="button"
                        onClick={() => removeBankAccount(index)}
                        className="absolute top-2 right-2 p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                      
                      <div>
                        <label className="block text-[10px] font-bold text-app-text-muted uppercase mb-1 tracking-widest">Nama Bank</label>
                        <input
                          type="text"
                          placeholder="Contoh: BCA / Mandiri"
                          className="w-full px-3 py-2 bg-app-card border border-app-border rounded-lg text-sm focus:ring-2 focus:ring-app-primary text-app-text"
                          value={account.bankName}
                          onChange={(e) => updateBankAccount(index, 'bankName', e.target.value)}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-[10px] font-bold text-app-text-muted uppercase mb-1 tracking-widest">Nomor Rekening</label>
                        <input
                          type="text"
                          placeholder="Contoh: 1234567890"
                          className="w-full px-3 py-2 bg-app-card border border-app-border rounded-lg text-sm focus:ring-2 focus:ring-app-primary font-mono text-app-text"
                          value={account.accountNumber}
                          onChange={(e) => updateBankAccount(index, 'accountNumber', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-app-text-muted uppercase mb-1 tracking-widest">Nama Pemilik (Opsional)</label>
                        <input
                          type="text"
                          placeholder="Contoh: John Doe"
                          className="w-full px-3 py-2 bg-app-card border border-app-border rounded-lg text-sm focus:ring-2 focus:ring-app-primary text-app-text"
                          value={account.accountHolder || ''}
                          onChange={(e) => updateBankAccount(index, 'accountHolder', e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                  {(formData.bankAccounts || []).length === 0 && (
                    <p className="text-xs text-app-text-muted italic text-center py-4">Belum ada rekening bank ditambahkan.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-sm font-black text-app-text uppercase tracking-widest border-b border-app-border/50 pb-2">Kontak & Alamat</h3>

              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Email Bisnis</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                  <input
                    required
                    type="email"
                    className="w-full pl-12 pr-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text"
                    value={formData.appEmail}
                    onChange={(e) => setFormData({ ...formData, appEmail: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Nomor Telepon</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                  <input
                    required
                    type="text"
                    className="w-full pl-12 pr-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text"
                    value={formData.appPhone}
                    onChange={(e) => setFormData({ ...formData, appPhone: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">Alamat Lengkap</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-4 text-app-text-muted" size={18} />
                  <textarea
                    required
                    rows={3}
                    className="w-full pl-12 pr-4 py-3 bg-app-bg border-none rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text"
                    value={formData.appAddress}
                    onChange={(e) => setFormData({ ...formData, appAddress: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-4">
                <h3 className="text-sm font-black text-app-text uppercase tracking-widest border-b border-app-border/50 pb-2 mb-4">Tema Aplikasi</h3>
                <div className="grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, theme: 'default' })}
                    className={clsx(
                      "flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                      formData.theme === 'default' ? "border-app-primary bg-app-bg" : "border-app-border hover:border-app-text-muted/30"
                    )}
                  >
                    <div className="w-10 h-10 bg-white border border-neutral-200 rounded-lg flex items-center justify-center text-neutral-900">
                      <Sun size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-app-text">Default Light</p>
                      <p className="text-[10px] text-app-text-muted uppercase font-black">Bersih & Minimalis</p>
                    </div>
                    {formData.theme === 'default' && <CheckCircle2 className="ml-auto text-app-primary" size={20} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, theme: 'dark' })}
                    className={clsx(
                      "flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                      formData.theme === 'dark' ? "border-app-primary bg-app-bg" : "border-app-border hover:border-app-text-muted/30"
                    )}
                  >
                    <div className="w-10 h-10 bg-neutral-900 rounded-lg flex items-center justify-center text-white">
                      <Moon size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-app-text">Dark Mode</p>
                      <p className="text-[10px] text-app-text-muted uppercase font-black">Elegan & Nyaman</p>
                    </div>
                    {formData.theme === 'dark' && <CheckCircle2 className="ml-auto text-app-primary" size={20} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, theme: 'ocean' })}
                    className={clsx(
                      "flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                      formData.theme === 'ocean' ? "border-app-primary bg-app-bg" : "border-app-border hover:border-app-text-muted/30"
                    )}
                  >
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                      <Waves size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-app-text">Ocean Breeze</p>
                      <p className="text-[10px] text-app-text-muted uppercase font-black">Segar & Profesional</p>
                    </div>
                    {formData.theme === 'ocean' && <CheckCircle2 className="ml-auto text-app-primary" size={20} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-app-border/50 flex items-center justify-between">
            {showSuccess ? (
              <div className="flex items-center gap-2 text-emerald-600 font-bold animate-in fade-in slide-in-from-left-4">
                <CheckCircle2 size={20} />
                Pengaturan berhasil disimpan!
              </div>
            ) : <div />}
            
            <button
              disabled={isSaving}
              type="submit"
              className="flex items-center gap-3 bg-app-primary text-white px-10 py-4 rounded-xl font-bold hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <Save size={20} />
              {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-app-bg border border-app-border rounded-2xl p-6">
        <h4 className="text-xs font-black text-app-text uppercase tracking-widest mb-4">Pratinjau Logo</h4>
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-app-card rounded-2xl border border-app-border flex items-center justify-center overflow-hidden">
            {formData.appLogo ? (
              <img src={formData.appLogo} alt="Logo Preview" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-app-text-muted text-2xl font-black">{formData.appName.charAt(0)}</span>
            )}
          </div>
          <div>
            <p className="font-bold text-app-text">{formData.appName}</p>
            <p className="text-sm text-app-text-muted">{formData.appEmail}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
