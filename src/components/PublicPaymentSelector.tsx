import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Invoice, Client } from '../types';
import { useSettings } from '../SettingsContext';
import { generateDynamicQRIS } from '../utils/qris';
import { 
  QrCode, 
  Building2, 
  ChevronDown, 
  Copy, 
  Check, 
  Download, 
  ExternalLink, 
  Clock, 
  CheckCircle2, 
  Smartphone, 
  HelpCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Server,
  Zap
} from 'lucide-react';

interface PublicPaymentSelectorProps {
  invoice: Invoice;
  client?: Client;
}

export type PaymentMethodType = 'qris' | 'bank_transfer' | 'all';

interface ServerQrisResponse {
  success: boolean;
  mode?: 'INTERNAL_LOCAL' | 'EXTERNAL_PROXY';
  endpointUsed?: string;
  transactionId?: string;
  qrisContent?: string;
  qrImageUrl?: string;
  merchantName?: string;
  formattedAmount?: string;
  expiresAt?: string;
  latencyMs?: number;
  httpStatus?: number;
  status?: string;
  error?: string;
  hint?: string;
}

export const PublicPaymentSelector: React.FC<PublicPaymentSelectorProps> = ({ invoice, client }) => {
  const { settings } = useSettings();
  
  const isQrisAvailable = settings.qrisConfig?.enabled !== false;
  const isBankAvailable = (settings.bankAccounts && settings.bankAccounts.length > 0) || false;

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>(() => {
    if (isQrisAvailable) return 'qris';
    if (isBankAvailable) return 'bank_transfer';
    return 'all';
  });

  const [copiedBankIndex, setCopiedBankIndex] = useState<number | null>(null);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedQrisString, setCopiedQrisString] = useState(false);
  const [copiedTxId, setCopiedTxId] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(30 * 60);

  // Server QRIS State
  const [isLoadingQris, setIsLoadingQris] = useState<boolean>(false);
  const [qrisError, setQrisError] = useState<string | null>(null);
  const [serverQris, setServerQris] = useState<ServerQrisResponse | null>(null);
  const qrRef = useRef<SVGSVGElement>(null);

  const merchantName = settings.qrisConfig?.merchantName || settings.appName || 'SEPTIAN NETWORK';
  const nmid = settings.qrisConfig?.nmid || 'ID102003849102';

  // Fetch QRIS from connected QRIS API Server via proxy
  const fetchQrisFromServer = useCallback(async () => {
    if (invoice.status === 'paid' || invoice.total <= 0) return;

    setIsLoadingQris(true);
    setQrisError(null);

    try {
      const targetEndpoint = settings.qrisConfig?.apiEndpoint || '/api/qris/generate';
      const secretKey = settings.qrisConfig?.secretApiKey || '';

      const response = await fetch('/api/qris/proxy-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiEndpoint: targetEndpoint,
          secretApiKey: secretKey,
          payload: {
            amount: invoice.total,
            nominal: invoice.total,
            invoiceId: invoice.id,
            invoice_id: invoice.id,
            order_id: invoice.id,
            clientName: client?.name || invoice.clientName || 'Pelanggan',
            customer_name: client?.name || invoice.clientName || 'Pelanggan',
            merchantName: merchantName,
            nmid: nmid,
            expireMinutes: 30,
            webhookUrl: settings.qrisConfig?.webhookUrl || '',
            description: `Pembayaran Invoice #${invoice.id.slice(0, 8).toUpperCase()}`
          }
        })
      });

      const data: ServerQrisResponse = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.error || `HTTP ${data.httpStatus || response.status} gagal menghubungi Server QRIS`);
      }

      setServerQris(data);

      // Setup countdown from expiresAt if present
      if (data.expiresAt) {
        const diffSeconds = Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000));
        setTimeLeft(diffSeconds > 0 ? diffSeconds : 30 * 60);
      } else {
        setTimeLeft(30 * 60);
      }
    } catch (err) {
      console.warn('Gagal fetch QRIS dari server:', err);
      const errMsg = err instanceof Error ? err.message : 'Gagal menghasilkan QRIS dari server';
      setQrisError(errMsg);
      
      // Fallback local calculation so user can still pay if offline
      const fallbackPayload = generateDynamicQRIS({
        merchantName,
        nmid,
        invoiceId: invoice.id,
        amount: invoice.total,
        city: 'JAKARTA'
      });
      setServerQris({
        success: true,
        mode: 'INTERNAL_LOCAL',
        qrisContent: fallbackPayload,
        transactionId: `TX-${invoice.id.slice(0, 8).toUpperCase()}`,
        merchantName: merchantName
      });
    } finally {
      setIsLoadingQris(false);
    }
  }, [invoice.id, invoice.total, invoice.status, invoice.clientName, client?.name, merchantName, nmid, settings.qrisConfig]);

  // Initial trigger when QRIS method is active
  useEffect(() => {
    if (isQrisAvailable && invoice.status !== 'paid') {
      fetchQrisFromServer();
    }
  }, [fetchQrisFromServer, isQrisAvailable, invoice.status]);

  // Expiry countdown timer
  useEffect(() => {
    if (invoice.status === 'paid') return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [invoice.status]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const copyToClipboard = (text: string, type: 'bank' | 'amount' | 'qris' | 'txId', index?: number) => {
    navigator.clipboard.writeText(text);
    if (type === 'bank' && index !== undefined) {
      setCopiedBankIndex(index);
      setTimeout(() => setCopiedBankIndex(null), 2000);
    } else if (type === 'amount') {
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    } else if (type === 'qris') {
      setCopiedQrisString(true);
      setTimeout(() => setCopiedQrisString(false), 2000);
    } else if (type === 'txId') {
      setCopiedTxId(true);
      setTimeout(() => setCopiedTxId(false), 2000);
    }
  };

  // Download QR Code as PNG image
  const downloadQRCode = () => {
    const svg = document.getElementById('public-invoice-qris-svg');
    if (!svg && !serverQris?.qrImageUrl) return;

    if (serverQris?.qrImageUrl) {
      const a = document.createElement('a');
      a.href = serverQris.qrImageUrl;
      a.download = `QRIS-${invoice.id.slice(0, 8).toUpperCase()}-${invoice.total}.png`;
      a.target = '_blank';
      a.click();
      return;
    }

    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      canvas.width = 600;
      canvas.height = 700;

      img.onload = () => {
        if (!ctx) return;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#DC2626';
        ctx.fillRect(0, 0, canvas.width, 70);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('QRIS - PEMBAYARAN NASIONAL', canvas.width / 2, 45);

        ctx.drawImage(img, 100, 100, 400, 400);

        ctx.fillStyle = '#111827';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(serverQris?.merchantName || merchantName, canvas.width / 2, 530);

        ctx.fillStyle = '#4B5563';
        ctx.font = '16px monospace';
        ctx.fillText(`NMID: ${nmid}`, canvas.width / 2, 560);

        ctx.fillStyle = '#059669';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText(`Rp ${invoice.total.toLocaleString('id-ID')}`, canvas.width / 2, 605);

        ctx.fillStyle = '#6B7280';
        ctx.font = '14px sans-serif';
        ctx.fillText(`Invoice #${invoice.id.slice(0, 8).toUpperCase()} - ${client?.name || invoice.clientName}`, canvas.width / 2, 640);

        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `QRIS-${invoice.id.slice(0, 8).toUpperCase()}-${invoice.total}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      };

      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
    }
  };

  const cleanPhone = (settings.appPhone || '').replace(/[^0-9]/g, '');
  const waPhone = cleanPhone.startsWith('0') ? `62${cleanPhone.slice(1)}` : cleanPhone;
  const waMessage = encodeURIComponent(
    `Halo ${settings.appName || 'Admin'}, saya telah melakukan pembayaran untuk Invoice #${invoice.id.slice(0, 8).toUpperCase()} sebesar Rp ${invoice.total.toLocaleString('id-ID')} melalui QRIS (Ref Tx: ${serverQris?.transactionId || invoice.id}). Mohon konfirmasinya. Terima kasih.`
  );
  const waUrl = `https://wa.me/${waPhone}?text=${waMessage}`;

  const currentQrisPayload = serverQris?.qrisContent || generateDynamicQRIS({
    merchantName,
    nmid,
    invoiceId: invoice.id,
    amount: invoice.total,
    city: 'JAKARTA'
  });

  return (
    <div id="payment-method-section" className="mb-8 print:hidden">
      <div className="bg-app-card border border-app-border rounded-2xl p-4 sm:p-6 shadow-sm">
        
        {/* Top Header & Dropdown Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-app-border">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 bg-app-primary/10 text-app-primary rounded-lg">
                <Smartphone size={18} />
              </span>
              <h3 className="font-black text-base sm:text-lg text-app-text">
                Pilih Metode Pembayaran
              </h3>
            </div>
            <p className="text-xs text-app-text-muted">
              Pilih opsi pembayaran favorit Anda untuk menyelesaikan tagihan ini.
            </p>
          </div>

          {/* Dropdown Selector */}
          <div className="relative min-w-[260px] sm:min-w-[280px]">
            <label htmlFor="payment-method-select" className="sr-only">
              Metode Pembayaran
            </label>
            <div className="relative">
              <select
                id="payment-method-select"
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value as PaymentMethodType)}
                className="w-full appearance-none pl-10 pr-10 py-2.5 bg-app-bg border border-app-border text-app-text rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-app-primary focus:border-transparent cursor-pointer shadow-xs transition-all"
              >
                {isQrisAvailable && (
                  <option value="qris">
                    ⚡ QRIS Dinamis (Otomatis dari Server)
                  </option>
                )}
                {isBankAvailable && (
                  <option value="bank_transfer">
                    🏦 Transfer Bank Manual
                  </option>
                )}
                <option value="all">
                  📄 Tampilkan Semua Metode
                </option>
              </select>

              {/* Icon Left */}
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-app-primary">
                {selectedMethod === 'qris' ? (
                  <QrCode size={18} />
                ) : selectedMethod === 'bank_transfer' ? (
                  <Building2 size={18} />
                ) : (
                  <Sparkles size={18} />
                )}
              </div>

              {/* Arrow Right */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-app-text-muted">
                <ChevronDown size={18} />
              </div>
            </div>
          </div>
        </div>

        {/* Amount to Pay Summary */}
        <div className="my-5 p-4 bg-app-bg border border-app-border rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-app-text-muted">
              Total yang Harus Dibayar
            </p>
            <p className="text-xl sm:text-2xl font-black text-app-text">
              Rp {invoice.total.toLocaleString('id-ID')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard(invoice.total.toString(), 'amount')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-app-card hover:bg-app-border/40 border border-app-border text-app-text rounded-lg text-xs font-semibold transition-all"
          >
            {copiedAmount ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            {copiedAmount ? 'Tersalin' : 'Salin Nominal'}
          </button>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* VIEW 1: QRIS DINAMIS FROM CONNECTED SERVER */}
        {/* ------------------------------------------------------------- */}
        {(selectedMethod === 'qris' || selectedMethod === 'all') && (
          <div className="mt-4 p-5 sm:p-6 bg-linear-to-b from-red-500/5 via-app-card to-app-card border-2 border-red-500/20 rounded-2xl">
            
            {/* Connected Server Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-app-border text-xs">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-full font-bold text-[11px]">
                  <Zap size={13} className="text-emerald-500" />
                  {serverQris?.mode === 'EXTERNAL_PROXY' ? 'Server Gateway Eksternal Terhubung' : 'Server QRIS Aktif'}
                </span>
                {serverQris?.transactionId && (
                  <span className="text-app-text-muted font-mono text-[11px] hidden sm:inline">
                    ID Transaksi: <strong className="text-app-text">{serverQris.transactionId}</strong>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={fetchQrisFromServer}
                disabled={isLoadingQris}
                className="flex items-center gap-1 text-[11px] text-app-primary hover:underline font-bold disabled:opacity-50"
              >
                <RefreshCw size={12} className={isLoadingQris ? 'animate-spin' : ''} />
                {isLoadingQris ? 'Memuat QRIS...' : 'Perbarui QRIS'}
              </button>
            </div>

            {/* Error Notice if API server had issues */}
            {qrisError && (
              <div className="mb-4 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 flex items-start gap-2.5">
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">Peringatan Server QRIS:</p>
                  <p className="text-[11px] mt-0.5">{qrisError}. Menggunakan fallback QRIS dinamis.</p>
                </div>
              </div>
            )}

            <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-8">
              
              {/* Left Column: QR Code Display */}
              <div className="flex flex-col items-center shrink-0 w-full sm:w-auto">
                <div className="relative bg-white text-neutral-900 p-4 rounded-2xl border-2 border-neutral-900 shadow-md flex flex-col items-center max-w-[280px] w-full min-h-[340px] justify-between">
                  {/* QRIS Header */}
                  <div className="w-full flex items-center justify-between border-b border-neutral-200 pb-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-black tracking-tighter text-red-600">QRIS</span>
                      <span className="text-[9px] bg-red-600 text-white font-extrabold px-1.5 py-0.2 rounded">
                        GPN
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                      SERVER GENERATED
                    </span>
                  </div>

                  {/* QR Code SVG / Image with Loading Spinner */}
                  <div className="p-2 bg-white rounded-xl flex items-center justify-center relative min-h-[200px] w-full">
                    {isLoadingQris ? (
                      <div className="flex flex-col items-center justify-center p-8 text-neutral-400 space-y-2">
                        <RefreshCw size={36} className="animate-spin text-red-600" />
                        <p className="text-[11px] font-bold text-neutral-600">Mengambil QRIS Server...</p>
                      </div>
                    ) : serverQris?.qrImageUrl ? (
                      <img 
                        src={serverQris.qrImageUrl} 
                        alt="QRIS Barcode" 
                        className="w-48 h-48 object-contain"
                      />
                    ) : (
                      <QRCodeSVG
                        id="public-invoice-qris-svg"
                        ref={qrRef}
                        value={currentQrisPayload}
                        size={200}
                        level="M"
                        includeMargin={false}
                      />
                    )}
                  </div>

                  {/* Merchant Details in QR Box */}
                  <div className="w-full mt-2 pt-2 border-t border-neutral-100 text-center">
                    <p className="text-xs font-bold text-neutral-900 truncate">
                      {serverQris?.merchantName || merchantName}
                    </p>
                    <p className="text-[10px] font-mono text-neutral-500">
                      NMID: {nmid}
                    </p>
                    <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-black">
                      <CheckCircle2 size={11} />
                      Nominal: Rp {invoice.total.toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>

                {/* Expiry Timer Badge */}
                {invoice.status !== 'paid' && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-app-text-muted font-medium bg-app-bg px-3 py-1.5 rounded-full border border-app-border">
                    <Clock size={13} className="text-amber-500" />
                    <span>Masa Berlaku:</span>
                    <span className="font-mono font-bold text-app-text">
                      {timeLeft <= 0 ? 'KADALUARSA' : formatTimer(timeLeft)}
                    </span>
                    {timeLeft <= 0 && (
                      <button
                        type="button"
                        onClick={fetchQrisFromServer}
                        className="text-app-primary text-xs font-bold underline ml-1"
                      >
                        Perbarui
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Information & Actions */}
              <div className="flex-1 space-y-4 w-full">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 text-red-600 rounded-full text-xs font-bold mb-2">
                    <Sparkles size={13} />
                    Generate Otomatis dari Gateway QRIS
                  </div>
                  <h4 className="text-lg font-black text-app-text">
                    Scan Kode QRIS Dinamis
                  </h4>
                  <p className="text-xs text-app-text-muted leading-relaxed mt-1">
                    Kode QRIS di samping digenerate langsung dari server QRIS untuk tagihan sebesar <span className="font-bold text-app-text">Rp {invoice.total.toLocaleString('id-ID')}</span>. Nominal sudah terkunci otomatis saat Anda melakukan scan.
                  </p>
                </div>

                {/* Transaction Ref Card */}
                {serverQris?.transactionId && (
                  <div className="p-3 bg-app-bg border border-app-border rounded-xl flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-app-text-muted">No. Referensi Transaksi:</span>
                      <p className="text-xs font-mono font-bold text-app-text">{serverQris.transactionId}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(serverQris.transactionId || '', 'txId')}
                      className="text-xs text-app-primary hover:underline font-bold flex items-center gap-1"
                    >
                      {copiedTxId ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {copiedTxId ? 'Tersalin' : 'Salin Ref'}
                    </button>
                  </div>
                )}

                {/* Supported Apps Badges */}
                <div className="p-3 bg-app-bg border border-app-border rounded-xl">
                  <p className="text-[10px] font-bold text-app-text-muted uppercase tracking-wider mb-2">
                    Mendukung Semua Pembayaran QRIS:
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {['BCA Mobile', 'Livin Mandiri', 'BRImo', 'BNI Mobile', 'GoPay', 'OVO', 'DANA', 'ShopeePay', 'LinkAja'].map((app) => (
                      <span
                        key={app}
                        className="px-2 py-0.5 bg-app-card border border-app-border rounded text-[11px] font-semibold text-app-text"
                      >
                        {app}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Step-by-Step Payment Instructions */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-app-text flex items-center gap-1.5">
                    <HelpCircle size={14} className="text-app-primary" />
                    Cara Melakukan Pembayaran:
                  </p>
                  <ol className="text-xs text-app-text-muted space-y-1.5 list-decimal list-inside leading-relaxed pl-1">
                    <li>Buka aplikasi Mobile Banking atau e-Wallet favorit Anda.</li>
                    <li>Pilih menu <strong className="text-app-text">Bayar / Scan QRIS</strong>.</li>
                    <li>Arahkan kamera ke kode QR di atas (atau pilih dari galeri jika diunduh).</li>
                    <li>Periksa nama penerima <strong className="text-app-text">{serverQris?.merchantName || merchantName}</strong> dan nominal <strong className="text-app-text">Rp {invoice.total.toLocaleString('id-ID')}</strong>.</li>
                    <li>Konfirmasi dan masukkan PIN Anda untuk menyelesaikan pembayaran.</li>
                  </ol>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={downloadQRCode}
                    disabled={isLoadingQris}
                    className="flex items-center gap-2 px-4 py-2.5 bg-app-primary text-white rounded-xl text-xs font-bold hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
                  >
                    <Download size={15} />
                    Unduh Kode QR
                  </button>

                  {cleanPhone && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                    >
                      <ExternalLink size={15} />
                      Konfirmasi via WhatsApp
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => copyToClipboard(currentQrisPayload, 'qris')}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-app-bg hover:bg-app-border/40 border border-app-border text-app-text rounded-xl text-xs font-medium transition-all"
                    title="Salin Raw Data QRIS"
                  >
                    {copiedQrisString ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    {copiedQrisString ? 'Data Tersalin' : 'Salin Data QR'}
                  </button>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 2: TRANSFER BANK (Selected or All) */}
        {/* ------------------------------------------------------------- */}
        {(selectedMethod === 'bank_transfer' || selectedMethod === 'all') && (
          <div className={`${selectedMethod === 'all' ? 'mt-6 pt-6 border-t border-app-border' : 'mt-4'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-app-primary" />
                <h4 className="text-base font-black text-app-text">
                  Transfer Bank Manual
                </h4>
              </div>
              <span className="text-[11px] text-app-text-muted">
                Pilih salah satu rekening tujuan
              </span>
            </div>

            {settings.bankAccounts && settings.bankAccounts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {settings.bankAccounts.map((acc, index) => (
                  <div
                    key={index}
                    className="p-4 bg-app-bg border border-app-border rounded-xl flex flex-col justify-between hover:border-app-primary/40 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-app-primary/10 text-app-primary font-black text-xs rounded">
                        {acc.bankName}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(acc.accountNumber, 'bank', index)}
                        className="flex items-center gap-1 text-xs text-app-primary hover:underline font-bold"
                      >
                        {copiedBankIndex === index ? (
                          <>
                            <Check size={13} className="text-emerald-500" />
                            <span className="text-emerald-500">Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>Salin No. Rek</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div>
                      <p className="font-mono text-base sm:text-lg font-black text-app-text tracking-wide">
                        {acc.accountNumber}
                      </p>
                      {acc.accountHolder && (
                        <p className="text-xs text-app-text-muted mt-0.5">
                          a.n. {acc.accountHolder}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-app-bg border border-app-border rounded-xl text-center text-xs text-app-text-muted">
                Belum ada data rekening bank yang didaftarkan pada pengaturan aplikasi.
              </div>
            )}

            {cleanPhone && (
              <div className="mt-4 flex items-center justify-between p-3 bg-app-bg border border-app-border rounded-xl text-xs">
                <span className="text-app-text-muted">
                  Sudah transfer? Kirim bukti transfer untuk verifikasi otomatis.
                </span>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-emerald-600 font-bold hover:underline shrink-0"
                >
                  Kirim Bukti Transfer <ArrowRight size={13} />
                </a>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
