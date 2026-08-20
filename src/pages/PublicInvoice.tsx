import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db, doc, getDoc, onSnapshot, updateDoc, handleFirestoreError, OperationType } from '../firebase';
import { Invoice, Client } from '../types';
import { InvoiceView } from '../components/InvoiceView';
import { PublicPaymentSelector } from '../components/PublicPaymentSelector';
import { PaymentSuccessModal } from '../components/PaymentSuccessModal';
import { Loader2, AlertCircle, Printer, CheckCircle2, Clock } from 'lucide-react';
import { useSettings } from '../SettingsContext';

export const PublicInvoice: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { settings } = useSettings();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Payment Success Popup State
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successPaymentData, setSuccessPaymentData] = useState<{
    transactionId?: string;
    paymentSource?: string;
    paidAt?: string;
  } | null>(null);

  useEffect(() => {
    if (settings.appName) {
      document.title = `${settings.appName} - Invoice #${id ? id.slice(0, 8).toUpperCase() : ''}`;
    }
  }, [settings.appName, id]);

  useEffect(() => {
    if (!id) return;

    let isInitialLoad = true;

    // Real-time listener for Firestore invoice document
    const unsub = onSnapshot(doc(db, 'invoices', id), async (docSnap) => {
      if (docSnap.exists()) {
        const invData = { id: docSnap.id, ...docSnap.data() } as Invoice;
        
        // If status changed to paid from external update
        if (!isInitialLoad && invData.status === 'paid' && invoice?.status !== 'paid') {
          setSuccessPaymentData({
            transactionId: invData.id,
            paymentSource: 'QRIS Dinamis',
            paidAt: invData.paidAt || new Date().toISOString()
          });
          setIsSuccessModalOpen(true);
        }

        setInvoice(invData);

        if (invData.clientId && (!client || client.id !== invData.clientId)) {
          try {
            const clientSnap = await getDoc(doc(db, 'clients', invData.clientId));
            if (clientSnap.exists()) {
              setClient({ id: clientSnap.id, ...clientSnap.data() } as Client);
            }
          } catch {
            // Silently handle client load
          }
        }
      } else {
        setError('Invoice tidak ditemukan.');
      }
      setLoading(false);
      isInitialLoad = false;
    }, (err) => {
      console.error("Firestore onSnapshot error:", err);
      setError('Gagal memuat invoice.');
      setLoading(false);
    });

    return () => unsub();
  }, [id]);

  const handlePaymentSuccess = async (payment: {
    transactionId?: string;
    paymentSource?: string;
    paidAt?: string;
  }) => {
    setSuccessPaymentData(payment);
    setIsSuccessModalOpen(true);

    // Update local state and Firestore if not already paid
    if (invoice && invoice.status !== 'paid' && id) {
      setInvoice(prev => prev ? { ...prev, status: 'paid', paidAt: payment.paidAt || new Date().toISOString() } : null);
      try {
        await updateDoc(doc(db, 'invoices', id), {
          status: 'paid',
          paidAt: payment.paidAt || new Date().toISOString(),
          paymentMethod: payment.paymentSource || 'QRIS Dinamis'
        });
      } catch (e) {
        console.warn("Could not update invoice in firestore directly (client permission):", e);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-app-text-muted" size={48} />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h1 className="text-2xl font-black text-app-text mb-2">Ups! Terjadi Kesalahan</h1>
          <p className="text-app-text-muted">{error || 'Invoice tidak tersedia.'}</p>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === 'paid';

  return (
    <div className="min-h-screen bg-app-bg py-6 md:py-12 px-4 md:px-6">
      {/* Top Action & Status Bar */}
      <div className="max-w-4xl mx-auto mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 ${
            isPaid 
              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
              : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
          }`}>
            {isPaid ? <CheckCircle2 size={15} /> : <Clock size={15} />}
            <span>{isPaid ? 'INVOICE SUDAH LUNAS' : 'MENUNGGU PEMBAYARAN'}</span>
          </div>
          <span className="text-xs text-app-text-muted font-mono">
            #{invoice.id.slice(0, 8).toUpperCase()}
          </span>
        </div>

        <button 
          onClick={() => window.print()}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-app-card hover:bg-app-border/40 border border-app-border text-app-text rounded-xl font-bold text-sm transition-all shadow-xs"
        >
          <Printer size={16} />
          Cetak Dokumen
        </button>
      </div>

      {/* Interactive Payment Method Dropdown & Dynamic QRIS Selector */}
      <div className="max-w-4xl mx-auto">
        <PublicPaymentSelector 
          invoice={invoice} 
          client={client || undefined} 
          onPaymentSuccess={handlePaymentSuccess}
        />
      </div>

      {/* Official Invoice Sheet */}
      <InvoiceView invoice={invoice} client={client || undefined} isPublic={true} />

      <div className="max-w-4xl mx-auto mt-8 text-center pb-8 print:hidden">
        <p className="text-xs text-app-text-muted uppercase tracking-widest font-bold">
          Diterbitkan oleh {settings.appName || 'Sistem Invoice'}
        </p>
      </div>

      {/* Pop-up Modal Webhook Transaksi Berhasil */}
      {invoice && (
        <PaymentSuccessModal
          isOpen={isSuccessModalOpen}
          onClose={() => setIsSuccessModalOpen(false)}
          invoice={invoice}
          transactionId={successPaymentData?.transactionId}
          paymentSource={successPaymentData?.paymentSource}
          paidAt={successPaymentData?.paidAt}
        />
      )}
    </div>
  );
};

