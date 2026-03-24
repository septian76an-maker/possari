import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db, doc, getDoc, handleFirestoreError, OperationType } from '../firebase';
import { Invoice, Client } from '../types';
import { InvoiceView } from '../components/InvoiceView';
import { Loader2, AlertCircle } from 'lucide-react';

export const PublicInvoice: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!id) return;
      try {
        const invSnap = await getDoc(doc(db, 'invoices', id));
        if (invSnap.exists()) {
          const invData = { id: invSnap.id, ...invSnap.data() } as Invoice;
          setInvoice(invData);
          
          const clientSnap = await getDoc(doc(db, 'clients', invData.clientId));
          if (clientSnap.exists()) {
            setClient({ id: clientSnap.id, ...clientSnap.data() } as Client);
          }
        } else {
          setError('Invoice tidak ditemukan.');
        }
      } catch (err) {
        setError('Gagal memuat invoice.');
        handleFirestoreError(err, OperationType.GET, `invoices/${id}`);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [id]);

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

  return (
    <div className="min-h-screen bg-app-bg py-12 px-6">
      <InvoiceView invoice={invoice} client={client || undefined} isPublic={true} />
      <div className="max-w-4xl mx-auto mt-8 text-center">
        <p className="text-xs text-app-text-muted uppercase tracking-widest font-bold">
          Diterbitkan oleh JasaPro
        </p>
      </div>
    </div>
  );
};
