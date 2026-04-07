import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Invoice, Client } from '../types';
import { useSettings } from '../SettingsContext';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { clsx } from 'clsx';

interface InvoiceViewProps {
  invoice: Invoice;
  client?: Client;
  isPublic?: boolean;
}

export const InvoiceView: React.FC<InvoiceViewProps> = ({ invoice, client, isPublic = false }) => {
  const { settings } = useSettings();
  const publicUrl = `${window.location.origin}/#/public/invoice/${invoice.id}`;

  return (
    <div className="bg-white p-4 sm:p-8 max-w-4xl mx-auto border border-neutral-200 shadow-sm print:shadow-none print:border-none rounded-xl sm:rounded-none">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-8 sm:mb-12">
        <div className="flex items-center gap-4">
          {settings.appLogo && (
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-neutral-50 rounded-xl flex items-center justify-center overflow-hidden border border-neutral-100">
              <img src={settings.appLogo} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
          )}
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-neutral-900 mb-1 uppercase tracking-tighter">
              {invoice.type === 'invoice' ? 'Invoice' : 'Penawaran'}
            </h1>
            <p className="text-neutral-500 font-mono text-xs sm:text-sm">#{invoice.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
        <div className="text-left sm:text-right w-full sm:w-auto">
          <h2 className="text-lg sm:text-xl font-bold text-neutral-900">{settings.appName}</h2>
          <p className="text-xs sm:text-sm text-neutral-500 whitespace-pre-wrap max-w-full sm:max-w-[200px] sm:ml-auto">{settings.appAddress}</p>
          <p className="text-xs sm:text-sm text-neutral-500">Telp: {settings.appPhone}</p>
          <p className="text-xs sm:text-sm text-neutral-500">{settings.appEmail}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12 mb-8 sm:mb-12">
        <div>
          <h3 className="text-[10px] sm:text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Ditagihkan Kepada</h3>
          <p className="text-base sm:text-lg font-bold text-neutral-900">{invoice.clientName}</p>
          {client && (
            <div className="text-sm sm:text-base">
              <p className="text-neutral-600">{client.email}</p>
              <p className="text-neutral-600">{client.phone}</p>
              <p className="text-neutral-600 whitespace-pre-wrap">{client.address}</p>
            </div>
          )}
        </div>
        <div className="text-left sm:text-right">
          <h3 className="text-[10px] sm:text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Detail</h3>
          <div className="space-y-1 text-sm sm:text-base">
            <div className="flex justify-start sm:justify-end gap-4">
              <span className="text-neutral-500">Tanggal:</span>
              <span className="text-neutral-900 font-medium">
                {format(new Date(invoice.createdAt), 'dd MMMM yyyy', { locale: id })}
              </span>
            </div>
            <div className="flex justify-start sm:justify-end gap-4">
              <span className="text-neutral-500">Status:</span>
              <span className={clsx(
                "font-bold uppercase text-[10px] sm:text-xs px-2 py-0.5 rounded",
                invoice.status === 'paid' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              )}>
                {invoice.status === 'paid' ? 'Lunas' : 'Belum Bayar'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0 mb-8 sm:mb-12">
        <table className="w-full min-w-[500px] sm:min-w-0">
          <thead>
            <tr className="border-b-2 border-neutral-900">
              <th className="text-left py-4 text-[10px] sm:text-xs font-bold text-neutral-900 uppercase tracking-widest">Deskripsi</th>
              <th className="text-center py-4 text-[10px] sm:text-xs font-bold text-neutral-900 uppercase tracking-widest">Harga</th>
              <th className="text-center py-4 text-[10px] sm:text-xs font-bold text-neutral-900 uppercase tracking-widest">Jumlah</th>
              <th className="text-right py-4 text-[10px] sm:text-xs font-bold text-neutral-900 uppercase tracking-widest">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {invoice.items.map((item, idx) => (
              <tr key={idx}>
                <td className="py-4 text-neutral-900 font-medium text-sm sm:text-base">
                  <div className="font-bold">{item.name}</div>
                  {item.description && (
                    <div className="text-xs text-neutral-500 mt-1 font-normal whitespace-pre-wrap leading-relaxed">
                      {item.description}
                    </div>
                  )}
                </td>
                <td className="py-4 text-center text-neutral-600 text-sm sm:text-base">Rp {item.price.toLocaleString('id-ID')}</td>
                <td className="py-4 text-center text-neutral-600 text-sm sm:text-base">{item.qty}</td>
                <td className="py-4 text-right font-bold text-neutral-900 text-sm sm:text-base">Rp {(item.price * item.qty).toLocaleString('id-ID')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {invoice.discountAmount && invoice.discountAmount > 0 ? (
              <>
                <tr className="border-t-2 border-neutral-900">
                  <td colSpan={3} className="py-2 text-right font-bold text-neutral-400 uppercase tracking-widest text-[10px] sm:text-xs">Subtotal</td>
                  <td className="py-2 text-right font-bold text-neutral-900 text-sm sm:text-base">Rp {(invoice.total + invoice.discountAmount).toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-2 text-right font-bold text-emerald-600 uppercase tracking-widest text-[10px] sm:text-xs">
                    Diskon {invoice.voucherCode && `(${invoice.voucherCode})`}
                  </td>
                  <td className="py-2 text-right font-bold text-emerald-600 text-sm sm:text-base">- Rp {invoice.discountAmount.toLocaleString('id-ID')}</td>
                </tr>
                <tr className="border-t border-neutral-100">
                  <td colSpan={3} className="py-6 text-right font-bold text-neutral-900 uppercase tracking-widest text-xs sm:text-sm">Total Keseluruhan</td>
                  <td className="py-6 text-right text-xl sm:text-2xl font-black text-neutral-900">Rp {invoice.total.toLocaleString('id-ID')}</td>
                </tr>
              </>
            ) : (
              <tr className="border-t-2 border-neutral-900">
                <td colSpan={3} className="py-6 text-right font-bold text-neutral-400 uppercase tracking-widest text-xs sm:text-sm">Total Keseluruhan</td>
                <td className="py-6 text-right text-xl sm:text-2xl font-black text-neutral-900">Rp {invoice.total.toLocaleString('id-ID')}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-8">
        <div className="text-neutral-400 text-[10px] sm:text-xs italic w-full sm:w-auto">
          <p>Terima kasih atas kepercayaan Anda.</p>
          {settings.bankAccounts && settings.bankAccounts.length > 0 ? (
            <div className="mt-4 not-italic text-neutral-600 space-y-3">
              <p className="font-bold text-neutral-900 uppercase tracking-widest text-[10px] mb-1">Informasi Pembayaran:</p>
              <div className="grid grid-cols-1 gap-3">
                {settings.bankAccounts.map((acc, i) => (
                  <div key={i} className="bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">{acc.bankName}</p>
                    <p className="font-mono text-sm font-bold text-neutral-900">{acc.accountNumber}</p>
                    {acc.accountHolder && <p className="text-[10px] text-neutral-500 mt-1">a/n {acc.accountHolder}</p>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2">Pembayaran dapat dilakukan melalui Transfer Bank yang telah disepakati.</p>
          )}
        </div>
        
        <div className="flex flex-col items-center gap-2 w-full sm:w-auto pt-6 sm:pt-0 border-t sm:border-t-0 border-neutral-100">
          {!isPublic && <QRCodeSVG value={publicUrl} size={80} />}
          <div className="text-center">
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest mb-1">Dibuat Oleh:</p>
            <p className="text-sm font-bold text-neutral-900">{invoice.creatorName || 'System'}</p>
          </div>
          {!isPublic && <p className="text-[8px] text-neutral-300 font-mono uppercase">Scan to View Online</p>}
        </div>
      </div>
    </div>
  );
};
