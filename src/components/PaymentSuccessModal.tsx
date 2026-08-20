import React, { useEffect } from 'react';
import { CheckCircle2, Printer, X, Sparkles, QrCode, ShieldCheck, ArrowRight } from 'lucide-react';
import { Invoice } from '../types';

interface PaymentSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  transactionId?: string;
  paymentSource?: string;
  paidAt?: string;
}

// Synthesize pleasant success chime using Web Audio API
function playSuccessChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Notes: C5 (523.25Hz) -> E5 (659.25Hz) -> G5 (783.99Hz) -> C6 (1046.50Hz)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.09);
      
      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.09);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + idx * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.09 + 0.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(ctx.currentTime + idx * 0.09);
      osc.stop(ctx.currentTime + idx * 0.09 + 0.6);
    });
  } catch {
    // Audio context may be restricted by browser policy if no prior interaction
  }
}

export const PaymentSuccessModal: React.FC<PaymentSuccessModalProps> = ({
  isOpen,
  onClose,
  invoice,
  transactionId,
  paymentSource = 'QRIS Dinamis',
  paidAt
}) => {
  useEffect(() => {
    if (isOpen) {
      playSuccessChime();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formattedAmount = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(invoice.total);

  const displayPaidTime = paidAt 
    ? new Date(paidAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: 'numeric', month: 'short', year: 'numeric' })
    : new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-app-card text-app-text border-2 border-emerald-500/40 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative overflow-hidden transform transition-all scale-100 animate-in zoom-in-95 duration-200">
        
        {/* Decorative Top Accent Glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-app-text-muted hover:text-app-text hover:bg-app-bg rounded-full transition-all"
        >
          <X size={20} />
        </button>

        {/* Success Icon & Pulsing Ring */}
        <div className="flex flex-col items-center text-center space-y-4 pt-2">
          <div className="relative">
            <div className="w-20 h-20 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-500 animate-pulse">
              <CheckCircle2 size={46} className="text-emerald-500" strokeWidth={2.5} />
            </div>
            <div className="absolute -top-1 -right-1 bg-emerald-500 text-white p-1 rounded-full shadow-md">
              <Sparkles size={14} />
            </div>
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs font-black rounded-full uppercase tracking-wider mb-2">
              <ShieldCheck size={14} />
              Transaksi Berhasil Terverifikasi
            </span>
            <h2 className="text-2xl font-black text-app-text tracking-tight">
              Pembayaran Diterima!
            </h2>
            <p className="text-xs text-app-text-muted mt-1">
              Terima kasih, pembayaran QRIS Anda telah berhasil diverifikasi oleh server secara real-time.
            </p>
          </div>

          {/* Amount Paid Box */}
          <div className="w-full bg-app-bg border border-emerald-500/30 rounded-2xl p-4 text-center space-y-1">
            <span className="text-[11px] font-bold text-app-text-muted uppercase tracking-widest">
              Total Nominal Dibayar
            </span>
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
              {formattedAmount}
            </p>
            <div className="flex items-center justify-center gap-1.5 pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-[11px] font-bold text-emerald-600">Status: LUNAS</span>
            </div>
          </div>

          {/* Payment Detail Breakdown */}
          <div className="w-full bg-app-bg/50 border border-app-border rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-app-text-muted">No. Invoice</span>
              <span className="font-mono font-bold text-app-text">#{invoice.id.slice(0, 8).toUpperCase()}</span>
            </div>
            {invoice.clientName && (
              <div className="flex items-center justify-between">
                <span className="text-app-text-muted">Pelanggan</span>
                <span className="font-bold text-app-text">{invoice.clientName}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-app-text-muted">Metode Bayar</span>
              <span className="font-bold text-app-text flex items-center gap-1">
                <QrCode size={13} className="text-red-500" />
                {paymentSource}
              </span>
            </div>
            {transactionId && (
              <div className="flex items-center justify-between">
                <span className="text-app-text-muted">ID Referensi (TxID)</span>
                <span className="font-mono text-[11px] font-bold text-app-text">{transactionId}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-app-border/40">
              <span className="text-app-text-muted">Waktu Transaksi</span>
              <span className="text-app-text font-medium">{displayPaidTime}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="w-full space-y-2 pt-2">
            <button
              type="button"
              onClick={() => {
                window.print();
              }}
              className="w-full py-3 px-4 bg-app-primary hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Printer size={16} />
              Cetak / Simpan Bukti Pembayaran
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-app-bg hover:bg-app-border border border-app-border text-app-text rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            >
              Tutup Notifikasi
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
