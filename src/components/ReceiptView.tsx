import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Invoice, Client } from '../types';
import { useSettings } from '../SettingsContext';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface ReceiptViewProps {
  invoice: Invoice;
  client?: Client;
}

export const ReceiptView: React.FC<ReceiptViewProps> = ({ invoice, client }) => {
  const { settings } = useSettings();
  const paperWidth = settings.printerConfig?.paperWidth || '58mm';

  return (
    <div 
      className="bg-white text-black font-mono text-[10px] leading-tight mx-auto"
      style={{ width: paperWidth, padding: '4mm' }}
    >
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-sm font-bold uppercase">{settings.appName}</h2>
        <p className="whitespace-pre-wrap">{settings.appAddress}</p>
        <p>Telp: {settings.appPhone}</p>
        <div className="border-b border-dashed border-black my-2"></div>
      </div>

      {/* Info */}
      <div className="mb-4 space-y-1">
        <div className="flex justify-between">
          <span>No:</span>
          <span>#{invoice.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span>Tgl:</span>
          <span>{format(new Date(invoice.createdAt), 'dd/MM/yy HH:mm')}</span>
        </div>
        <div className="flex justify-between">
          <span>Kasir:</span>
          <span>{invoice.creatorName?.split(' ')[0] || 'Admin'}</span>
        </div>
        <div className="flex justify-between">
          <span>Klien:</span>
          <span className="text-right">{invoice.clientName}</span>
        </div>
        <div className="border-b border-dashed border-black my-2"></div>
      </div>

      {/* Items */}
      <div className="mb-4 space-y-2">
        {invoice.items.map((item, idx) => (
          <div key={idx}>
            <div className="flex justify-between font-bold">
              <span className="flex-1 pr-2">{item.name}</span>
              <span>{(item.price * item.qty).toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between text-[8px] text-neutral-600">
              <span>{item.qty} x {item.price.toLocaleString('id-ID')}</span>
            </div>
          </div>
        ))}
        <div className="border-b border-dashed border-black my-2"></div>
      </div>

      {/* Totals */}
      <div className="space-y-1">
        {invoice.discountAmount && invoice.discountAmount > 0 && (
          <>
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{(invoice.total + invoice.discountAmount).toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between">
              <span>Diskon:</span>
              <span>-{invoice.discountAmount.toLocaleString('id-ID')}</span>
            </div>
          </>
        )}
        <div className="flex justify-between text-sm font-bold pt-1">
          <span>TOTAL:</span>
          <span>Rp {invoice.total.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {/* QRIS on Receipt */}
      {settings.qrisConfig?.enabled && settings.qrisConfig?.showOnReceipt && (
        <div className="text-center my-4 pt-3 border-t border-dashed border-black flex flex-col items-center">
          <p className="font-bold text-[9px] uppercase tracking-wider mb-1">SCAN QRIS UNTUK BAYAR</p>
          <div className="p-1 bg-white border border-black rounded inline-block">
            {settings.qrisConfig.qrisImage ? (
              <img 
                src={settings.qrisConfig.qrisImage} 
                alt="QRIS" 
                className="w-24 h-24 object-contain mx-auto" 
                referrerPolicy="no-referrer"
              />
            ) : settings.qrisConfig.qrisContent ? (
              <QRCodeSVG value={settings.qrisConfig.qrisContent} size={90} />
            ) : null}
          </div>
          {settings.qrisConfig.merchantName && (
            <p className="text-[8px] font-bold mt-1">{settings.qrisConfig.merchantName}</p>
          )}
          {settings.qrisConfig.nmid && (
            <p className="text-[7px]">NMID: {settings.qrisConfig.nmid}</p>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-4 pt-3 border-t border-dashed border-black">
        <p className="font-bold uppercase mb-1 whitespace-pre-wrap">
          {settings.footerNote || 'Terima Kasih'}
        </p>
        <p className="text-[8px] mt-2 opacity-50">Powered by {settings.appName}</p>
      </div>
    </div>
  );
};
