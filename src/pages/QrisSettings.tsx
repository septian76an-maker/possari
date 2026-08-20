import React, { useState, useEffect } from 'react';
import { useSettings } from '../SettingsContext';
import { useAuth } from '../AuthContext';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Save, 
  QrCode, 
  Building2, 
  Image as ImageIcon, 
  CheckCircle2, 
  Trash2, 
  Settings as SettingsIcon, 
  ShieldCheck, 
  Smartphone, 
  FileCheck2,
  UploadCloud,
  Eye,
  Info,
  Key,
  Globe,
  Radio,
  Send,
  Copy,
  Check,
  RefreshCw,
  Play,
  Terminal,
  Code2,
  CheckCheck,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Zap,
  Server
} from 'lucide-react';
import { clsx } from 'clsx';
import { QrisConfig } from '../types';

interface WebhookLog {
  id: string;
  timestamp: string;
  source: string;
  headers: Record<string, any>;
  payload: any;
  status: 'PROCESSED' | 'RECEIVED' | 'FAILED';
}

export const QrisSettings: React.FC = () => {
  const { isAdmin } = useAuth();
  const { settings, updateSettings } = useSettings();

  const emptyQris: QrisConfig = {
    enabled: false,
    merchantName: '',
    nmid: '',
    qrisImage: '',
    qrisContent: '',
    showOnInvoice: false,
    showOnQuotation: false,
    showOnReceipt: false,
    instructions: '',
    apiEndpoint: '/api/qris/generate',
    secretApiKey: '',
    webhookUrl: ''
  };

  const [qrisData, setQrisData] = useState<QrisConfig>({
    ...emptyQris,
    ...(settings.qrisConfig || {})
  });

  const [activeTab, setActiveTab] = useState<'config' | 'sim-generate' | 'sim-webhook'>('config');
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Pengaturan QRIS berhasil disimpan!');
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Simulation: Generate QRIS State
  const [simAmount, setSimAmount] = useState<number>(150000);
  const [simInvoiceId, setSimInvoiceId] = useState<string>(`INV-${Date.now().toString().slice(-6)}`);
  const [simClientName, setSimClientName] = useState<string>('PT Sinar Nusantara');
  const [simExpireMinutes, setSimExpireMinutes] = useState<number>(30);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // Simulation: Webhook Callback State
  const [whEvent, setWhEvent] = useState<string>('payment.success');
  const [whStatus, setWhStatus] = useState<string>('PAID');
  const [whAmount, setWhAmount] = useState<number>(150000);
  const [whInvoiceId, setWhInvoiceId] = useState<string>(`INV-${Date.now().toString().slice(-6)}`);
  const [whProvider, setWhProvider] = useState<string>('GoPay');
  const [whTargetMode, setWhTargetMode] = useState<'local' | 'custom'>('local');
  const [whCustomTarget, setWhCustomTarget] = useState<string>('');
  const [isSendingWebhook, setIsSendingWebhook] = useState<boolean>(false);
  const [webhookResponse, setWebhookResponse] = useState<any | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);

  const defaultWebhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/qris/webhook` : '/api/qris/webhook';

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const generateRandomApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'qris_sec_';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setQrisData(prev => ({ ...prev, secretApiKey: key }));
  };

  const handleClearAll = async () => {
    setQrisData(emptyQris);
    if (!isAdmin) return;

    setIsSaving(true);
    try {
      await updateSettings({
        ...settings,
        qrisConfig: emptyQris
      });
      setSuccessMessage('Pengaturan QRIS telah dikosongkan!');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/png');
          setQrisData(prev => ({ ...prev, qrisImage: base64 }));
        }
        setIsProcessingImage(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setIsSaving(true);
    try {
      await updateSettings({
        ...settings,
        qrisConfig: qrisData
      });
      setSuccessMessage('Pengaturan QRIS berhasil disimpan!');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Run Simulation: POST /api/qris/generate (via backend proxy to prevent CORS errors)
  const runSimulateGenerate = async () => {
    setIsGenerating(true);
    setSimError(null);
    setSimResult(null);

    try {
      const response = await fetch('/api/qris/proxy-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiEndpoint: qrisData.apiEndpoint || '/api/qris/generate',
          secretApiKey: qrisData.secretApiKey || '',
          payload: {
            amount: simAmount,
            invoiceId: simInvoiceId,
            clientName: simClientName,
            merchantName: qrisData.merchantName || settings.appName || 'SEPTIAN NETWORK',
            nmid: qrisData.nmid || 'ID102003849102',
            expireMinutes: simExpireMinutes,
            description: `Pembayaran Invoice #${simInvoiceId}`
          }
        })
      });

      const data = await response.json();
      if (!response.ok || data.success === false) {
        const errorText = data.error || (data.response && JSON.stringify(data.response)) || `HTTP ${data.httpStatus || response.status} Error`;
        throw new Error(errorText);
      }
      setSimResult(data);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Gagal menjalankan generate QRIS');
    } finally {
      setIsGenerating(false);
    }
  };

  // Fetch Webhook logs
  const fetchWebhookLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/qris/webhook-logs');
      if (res.ok) {
        const data = await res.json();
        setWebhookLogs(data.logs || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Clear Webhook logs
  const clearWebhookLogs = async () => {
    try {
      await fetch('/api/qris/webhook-logs', { method: 'DELETE' });
      setWebhookLogs([]);
    } catch {
      // ignore
    }
  };

  // Run Simulation: Webhook Callback
  const runSimulateWebhook = async () => {
    setIsSendingWebhook(true);
    setWebhookResponse(null);

    const payload = {
      event: whEvent,
      transactionId: `QRIS-TX-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      invoiceId: whInvoiceId,
      amount: whAmount,
      currency: 'IDR',
      status: whStatus,
      paymentMethod: 'QRIS',
      paymentProvider: whProvider,
      paidAt: new Date().toISOString(),
      merchantName: qrisData.merchantName || settings.appName || 'SEPTIAN NETWORK',
      nmid: qrisData.nmid || 'ID102003849102',
      signature: `sig_${Math.random().toString(36).substring(2, 18)}`
    };

    const targetUrl = whTargetMode === 'local' 
      ? defaultWebhookUrl 
      : (whCustomTarget || qrisData.webhookUrl || defaultWebhookUrl);

    try {
      const res = await fetch('/api/qris/simulate-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetUrl,
          payload,
          secretApiKey: qrisData.secretApiKey
        })
      });

      const data = await res.json();
      setWebhookResponse(data);
      fetchWebhookLogs();
    } catch (err) {
      setWebhookResponse({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to send webhook callback'
      });
    } finally {
      setIsSendingWebhook(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sim-webhook') {
      fetchWebhookLogs();
    }
  }, [activeTab]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-app-text-muted font-bold">Akses Ditolak. Hanya Admin yang dapat mengubah pengaturan pembayaran QRIS.</p>
      </div>
    );
  }

  const supportedApps = [
    { name: 'BCA', color: 'bg-blue-700 text-white' },
    { name: 'Mandiri', color: 'bg-yellow-600 text-white' },
    { name: 'BRI', color: 'bg-blue-600 text-white' },
    { name: 'BNI', color: 'bg-orange-600 text-white' },
    { name: 'GoPay', color: 'bg-emerald-600 text-white' },
    { name: 'OVO', color: 'bg-purple-700 text-white' },
    { name: 'DANA', color: 'bg-sky-500 text-white' },
    { name: 'ShopeePay', color: 'bg-amber-600 text-white' },
    { name: 'LinkAja', color: 'bg-red-600 text-white' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-app-text tracking-tight flex items-center gap-3">
            <span className="p-2 bg-red-600/10 text-red-600 rounded-xl">
              <QrCode size={28} />
            </span>
            Pengaturan Pembayaran QRIS & API
          </h1>
          <p className="text-app-text-muted mt-1 text-sm">
            Konfigurasi Endpoint API, Secret API Key (X-API-Key), Webhook Callback, serta Simulasi Transaksi QRIS.
          </p>
        </div>

        {/* Submenu Top Switcher */}
        <div className="flex items-center bg-app-card p-1 rounded-xl border border-app-border shrink-0 shadow-xs">
          <Link
            to="/settings"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-app-text-muted hover:text-app-text transition-colors"
          >
            <SettingsIcon size={15} />
            Pengaturan Umum
          </Link>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-app-primary text-white shadow-xs">
            <QrCode size={15} />
            Pembayaran QRIS
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-app-border pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('config')}
          className={clsx(
            "flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs transition-all",
            activeTab === 'config'
              ? "bg-app-primary text-white shadow-sm"
              : "bg-app-card text-app-text-muted hover:text-app-text border border-app-border"
          )}
        >
          <SettingsIcon size={16} />
          Konfigurasi & Kredensial API
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sim-generate')}
          className={clsx(
            "flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs transition-all",
            activeTab === 'sim-generate'
              ? "bg-red-600 text-white shadow-sm"
              : "bg-app-card text-app-text-muted hover:text-app-text border border-app-border"
          )}
        >
          <Zap size={16} />
          Simulasi Generate QRIS (POST /api/qris/generate)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sim-webhook')}
          className={clsx(
            "flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs transition-all",
            activeTab === 'sim-webhook'
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-app-card text-app-text-muted hover:text-app-text border border-app-border"
          )}
        >
          <Radio size={16} />
          Simulasi Webhook Callback
          {webhookLogs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-bold">
              {webhookLogs.length}
            </span>
          )}
        </button>
      </div>

      {/* ================= TAB 1: CONFIGURATION & CREDENTIALS ================= */}
      {activeTab === 'config' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Status Switcher Banner */}
          <div className={clsx(
            "p-6 rounded-2xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm",
            qrisData.enabled 
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200" 
              : "bg-app-card border-app-border text-app-text"
          )}>
            <div className="flex items-start gap-4">
              <div className={clsx(
                "w-12 h-12 rounded-xl flex items-center justify-center font-black shrink-0",
                qrisData.enabled ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" : "bg-app-bg text-app-text-muted"
              )}>
                <QrCode size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-lg text-app-text">Status Pembayaran QRIS</h3>
                  <span className={clsx(
                    "text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider",
                    qrisData.enabled ? "bg-emerald-600 text-white" : "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  )}>
                    {qrisData.enabled ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <p className="text-xs text-app-text-muted mt-1 leading-relaxed">
                  {qrisData.enabled 
                    ? 'Metode pembayaran QRIS aktif. Pelanggan dapat memindai barcode untuk transaksi tagihan.' 
                    : 'Aktifkan agar barcode QRIS dan API integrasi aktif pada dokumen penjualan.'}
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={qrisData.enabled}
                onChange={(e) => setQrisData(prev => ({ ...prev, enabled: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-14 h-8 bg-neutral-300 peer-focus:outline-none rounded-full peer dark:bg-neutral-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* API Credentials Card */}
          <div className="bg-app-card rounded-2xl border border-app-border p-6 space-y-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-app-border/50 pb-4">
              <div>
                <h3 className="text-sm font-black text-app-text uppercase tracking-wider flex items-center gap-2">
                  <Server size={18} className="text-app-primary" />
                  Konfigurasi Endpoint API & Kredensial
                </h3>
                <p className="text-xs text-app-text-muted mt-0.5">
                  Parameter integrasi sistem pembayaran otomatis dengan mode REST API dan Webhook.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-600/10 text-red-600 text-[11px] font-bold rounded-lg self-start">
                <Code2 size={14} />
                Mode: POST /api/qris/generate
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Field 1: Endpoint API / Base URL */}
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-app-text-muted uppercase tracking-widest">
                    Endpoint API / Base URL
                  </label>
                  <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 text-app-text px-2 py-0.5 rounded font-mono font-bold">
                    POST Method
                  </span>
                </div>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                  <input
                    type="text"
                    placeholder="/api/qris/generate atau https://api.gateway.com/v1"
                    className="w-full pl-12 pr-24 py-3 bg-app-bg border border-app-border rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text text-xs font-mono font-semibold"
                    value={qrisData.apiEndpoint || ''}
                    onChange={(e) => setQrisData(prev => ({ ...prev, apiEndpoint: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setQrisData(prev => ({ ...prev, apiEndpoint: '/api/qris/generate' }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2.5 py-1 bg-app-card border border-app-border rounded-lg text-app-text hover:bg-app-border transition-colors"
                  >
                    Reset Default
                  </button>
                </div>
                <p className="text-[11px] text-app-text-muted">
                  Endpoint yang dipanggil untuk generate payload QRIS dinamis. Default server lokal: <code className="font-mono text-app-primary font-bold">/api/qris/generate</code>
                </p>
              </div>

              {/* Field 2: Secret API Key (Header Key: X-API-Key) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-app-text-muted uppercase tracking-widest">
                    Secret API Key
                  </label>
                  <span className="text-[10px] bg-red-600/10 text-red-600 px-2 py-0.5 rounded font-mono font-bold">
                    Header: X-API-Key
                  </span>
                </div>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="qris_sec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full pl-12 pr-28 py-3 bg-app-bg border border-app-border rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text text-xs font-mono"
                    value={qrisData.secretApiKey || ''}
                    onChange={(e) => setQrisData(prev => ({ ...prev, secretApiKey: e.target.value }))}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="p-1.5 text-app-text-muted hover:text-app-text rounded-lg transition-colors text-[10px] font-bold"
                    >
                      {showApiKey ? 'Sembunyi' : 'Lihat'}
                    </button>
                    {qrisData.secretApiKey && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(qrisData.secretApiKey || '', 'apiKey')}
                        className="p-1.5 text-app-text-muted hover:text-app-text rounded-lg transition-colors"
                        title="Copy Key"
                      >
                        {copiedField === 'apiKey' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-app-text-muted">
                    Dikirimkan pada HTTP request header dengan format: <code className="font-mono text-app-text font-bold">X-API-Key: &lt;key&gt;</code>
                  </p>
                  <button
                    type="button"
                    onClick={generateRandomApiKey}
                    className="text-[11px] text-app-primary hover:underline font-bold inline-flex items-center gap-1"
                  >
                    <Sparkles size={12} />
                    Generate Key Baru
                  </button>
                </div>
              </div>

              {/* Field 3: Webhook Callback URL */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-app-text-muted uppercase tracking-widest">
                    Webhook Callback URL
                  </label>
                  <span className="text-[10px] bg-emerald-600/10 text-emerald-600 px-2 py-0.5 rounded font-mono font-bold">
                    POST Callback
                  </span>
                </div>
                <div className="relative">
                  <Radio className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                  <input
                    type="text"
                    placeholder={defaultWebhookUrl}
                    className="w-full pl-12 pr-12 py-3 bg-app-bg border border-app-border rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text text-xs font-mono"
                    value={qrisData.webhookUrl || ''}
                    onChange={(e) => setQrisData(prev => ({ ...prev, webhookUrl: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(qrisData.webhookUrl || defaultWebhookUrl, 'webhookUrl')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-app-text-muted hover:text-app-text rounded-lg transition-colors"
                    title="Copy Webhook URL"
                  >
                    {copiedField === 'webhookUrl' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-[11px] text-app-text-muted">
                  URL untuk menerima notifikasi status transaksi otomatis saat pelanggan berhasil membayar.
                </p>
              </div>
            </div>
          </div>

          {/* Form Grid: Merchant Info & Document Placement */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              {/* Merchant Details Card */}
              <div className="bg-app-card rounded-2xl border border-app-border p-6 space-y-5 shadow-sm">
                <h3 className="text-xs font-black text-app-text uppercase tracking-widest border-b border-app-border/50 pb-3 flex items-center gap-2">
                  <Building2 size={16} className="text-app-primary" />
                  Identitas Merchant QRIS
                </h3>

                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">
                    Nama Merchant / Toko (Sesuai QRIS)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: SEPTIAN NETWORK"
                    className="w-full px-4 py-3 bg-app-bg border border-app-border rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text text-sm font-semibold"
                    value={qrisData.merchantName || ''}
                    onChange={(e) => setQrisData(prev => ({ ...prev, merchantName: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">
                    NMID (National Merchant ID - Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: ID102003849102"
                    className="w-full px-4 py-3 bg-app-bg border border-app-border rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text text-sm font-mono"
                    value={qrisData.nmid || ''}
                    onChange={(e) => setQrisData(prev => ({ ...prev, nmid: e.target.value }))}
                  />
                </div>
              </div>

              {/* Barcode Image & Payload Card */}
              <div className="bg-app-card rounded-2xl border border-app-border p-6 space-y-5 shadow-sm">
                <h3 className="text-xs font-black text-app-text uppercase tracking-widest border-b border-app-border/50 pb-3 flex items-center gap-2">
                  <QrCode size={16} className="text-app-primary" />
                  Foto Barcode QRIS & String Payload
                </h3>

                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-2 tracking-widest">
                    Upload Foto Barcode QRIS (PNG/JPG)
                  </label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="w-28 h-28 bg-white rounded-2xl border-2 border-dashed border-app-border flex items-center justify-center overflow-hidden relative group shrink-0 shadow-inner">
                      {qrisData.qrisImage ? (
                        <>
                          <img 
                            src={qrisData.qrisImage} 
                            alt="QRIS Barcode" 
                            className="w-full h-full object-contain p-2" 
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => setQrisData(prev => ({ ...prev, qrisImage: '' }))}
                            className="absolute inset-0 bg-red-950/70 text-white opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-xs font-bold"
                          >
                            <Trash2 size={18} />
                            Hapus
                          </button>
                        </>
                      ) : (
                        <div className="text-center p-2">
                          <QrCode size={32} className="mx-auto text-neutral-300 mb-1" />
                          <span className="text-[9px] text-neutral-400 font-bold block">Kosong</span>
                        </div>
                      )}
                      {isProcessingImage && (
                        <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-app-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      <label className="inline-flex items-center gap-2 bg-app-primary text-white px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer hover:opacity-90 transition-all shadow-sm">
                        <UploadCloud size={16} />
                        Pilih Gambar QRIS
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/png, image/jpeg, image/jpg, image/webp" 
                          onChange={handleImageUpload} 
                        />
                      </label>
                      <p className="text-[11px] text-app-text-muted leading-relaxed">
                        Unggah barcode QRIS statis merchant Anda. Otomatis dikompresi agar jernih saat cetak.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-app-border/40">
                  <label className="block text-xs font-bold text-app-text-muted uppercase tracking-widest mb-1.5">
                    Kode String Payload QRIS (EMVCo - Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="00020101021126590014ID.LINKAJA.WWW0118..."
                    className="w-full px-4 py-2.5 bg-app-bg border border-app-border rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text text-xs font-mono"
                    value={qrisData.qrisContent || ''}
                    onChange={(e) => setQrisData(prev => ({ ...prev, qrisContent: e.target.value }))}
                  />
                </div>
              </div>

              {/* Document Display Placement */}
              <div className="bg-app-card rounded-2xl border border-app-border p-6 space-y-4 shadow-sm">
                <h3 className="text-xs font-black text-app-text uppercase tracking-widest border-b border-app-border/50 pb-3 flex items-center gap-2">
                  <FileCheck2 size={16} className="text-app-primary" />
                  Penempatan QRIS pada Dokumen
                </h3>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3.5 bg-app-bg rounded-xl border border-app-border cursor-pointer hover:border-app-primary/50 transition-all">
                    <input
                      type="checkbox"
                      checked={qrisData.showOnInvoice ?? false}
                      onChange={(e) => setQrisData(prev => ({ ...prev, showOnInvoice: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 rounded border-app-border text-app-primary focus:ring-app-primary"
                    />
                    <div>
                      <span className="font-bold text-sm text-app-text block">Tampilkan pada Lembar Invoice</span>
                      <span className="text-xs text-app-text-muted block mt-0.5">
                        Menampilkan barcode pembayaran QRIS pada tagihan resmi dan invoice link online.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3.5 bg-app-bg rounded-xl border border-app-border cursor-pointer hover:border-app-primary/50 transition-all">
                    <input
                      type="checkbox"
                      checked={qrisData.showOnQuotation ?? false}
                      onChange={(e) => setQrisData(prev => ({ ...prev, showOnQuotation: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 rounded border-app-border text-app-primary focus:ring-app-primary"
                    />
                    <div>
                      <span className="font-bold text-sm text-app-text block">Tampilkan pada Lembar Penawaran (Quotation)</span>
                      <span className="text-xs text-app-text-muted block mt-0.5">
                        Menampilkan QRIS untuk kemudahan pembayaran uang muka (DP) pada penawaran harga.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3.5 bg-app-bg rounded-xl border border-app-border cursor-pointer hover:border-app-primary/50 transition-all">
                    <input
                      type="checkbox"
                      checked={qrisData.showOnReceipt ?? false}
                      onChange={(e) => setQrisData(prev => ({ ...prev, showOnReceipt: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 rounded border-app-border text-app-primary focus:ring-app-primary"
                    />
                    <div>
                      <span className="font-bold text-sm text-app-text block">Tampilkan pada Struk Kasir (Thermal Receipt)</span>
                      <span className="text-xs text-app-text-muted block mt-0.5">
                        Mencetak barcode QRIS pada struk kasir thermal 58mm / 80mm.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-app-card rounded-2xl border border-app-border p-6 space-y-3 shadow-sm">
                <h3 className="text-xs font-black text-app-text uppercase tracking-widest border-b border-app-border/50 pb-3 flex items-center gap-2">
                  <Info size={16} className="text-app-primary" />
                  Petunjuk Pembayaran QRIS
                </h3>
                <textarea
                  rows={2}
                  placeholder="Scan QRIS menggunakan BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, ShopeePay..."
                  className="w-full px-4 py-3 bg-app-bg border border-app-border rounded-xl focus:ring-2 focus:ring-app-primary transition-all text-app-text text-xs"
                  value={qrisData.instructions || ''}
                  onChange={(e) => setQrisData(prev => ({ ...prev, instructions: e.target.value }))}
                />
              </div>
            </div>

            {/* Live Preview Column (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-app-card rounded-2xl border border-app-border p-6 space-y-5 shadow-sm sticky top-6">
                <div className="flex items-center justify-between border-b border-app-border/50 pb-3">
                  <h3 className="text-xs font-black text-app-text uppercase tracking-widest flex items-center gap-2">
                    <Eye size={16} className="text-app-primary" />
                    Pratinjau QRIS Real-time
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-red-600/10 text-red-600 rounded">
                    Live Preview
                  </span>
                </div>

                {/* QRIS Official Card Preview */}
                <div className="bg-white text-neutral-900 rounded-2xl p-6 border-2 border-neutral-200 shadow-md flex flex-col items-center text-center space-y-4">
                  <div className="w-full flex items-center justify-between border-b-2 border-neutral-900 pb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl font-black tracking-tighter text-red-600">QRIS</span>
                      <span className="text-[8px] font-bold tracking-widest text-neutral-500 uppercase leading-none text-left">
                        Quick Response Code<br />Indonesian Standard
                      </span>
                    </div>
                    <span className="text-[10px] font-black tracking-wider bg-red-600 text-white px-2 py-0.5 rounded">
                      GPN
                    </span>
                  </div>

                  <div className="w-full">
                    <h4 className="font-black text-base uppercase text-neutral-900 tracking-tight">
                      {qrisData.merchantName || settings.appName || 'NAMA MERCHANT'}
                    </h4>
                    {qrisData.nmid && (
                      <p className="text-[11px] font-mono text-neutral-500 font-bold mt-0.5">
                        NMID: {qrisData.nmid}
                      </p>
                    )}
                  </div>

                  <div className="p-3 bg-white border-2 border-neutral-900 rounded-xl shadow-sm flex items-center justify-center w-44 h-44">
                    {qrisData.qrisImage ? (
                      <img 
                        src={qrisData.qrisImage} 
                        alt="QRIS Preview" 
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : qrisData.qrisContent ? (
                      <QRCodeSVG value={qrisData.qrisContent} size={150} level="M" />
                    ) : (
                      <div className="text-neutral-400 text-center p-2">
                        <QrCode size={40} className="mx-auto mb-1 text-neutral-300" />
                        <p className="text-[9px] font-semibold">Upload gambar atau generate via API</p>
                      </div>
                    )}
                  </div>

                  <div className="w-full pt-2 border-t border-neutral-100">
                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
                      Menerima Pembayaran Melalui:
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      {supportedApps.map(app => (
                        <span 
                          key={app.name} 
                          className={clsx("text-[9px] font-bold px-2 py-0.5 rounded", app.color)}
                        >
                          {app.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick links to simulations */}
                <div className="p-4 bg-app-bg rounded-xl space-y-2 border border-app-border">
                  <p className="text-xs font-bold text-app-text">Uji Coba Integrasi:</p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('sim-generate')}
                      className="flex items-center justify-between p-2.5 bg-app-card hover:bg-app-border rounded-lg text-xs font-semibold text-app-text transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Zap size={14} className="text-red-600" />
                        Test Generate Dynamic QRIS
                      </span>
                      <ChevronRight size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('sim-webhook')}
                      className="flex items-center justify-between p-2.5 bg-app-card hover:bg-app-border rounded-lg text-xs font-semibold text-app-text transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Radio size={14} className="text-blue-600" />
                        Test Webhook Callback Payment
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Save & Reset Actions */}
          <div className="bg-app-card border border-app-border rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            {showSuccess ? (
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                <CheckCircle2 size={20} />
                {successMessage}
              </div>
            ) : (
              <div className="text-xs text-app-text-muted flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" />
                Perubahan tersimpan otomatis dan terintegrasi dengan modul Invoice.
              </div>
            )}

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                disabled={isSaving}
                type="button"
                onClick={handleClearAll}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-neutral-100 hover:bg-red-50 text-neutral-600 hover:text-red-600 dark:bg-neutral-800 dark:hover:bg-red-950/40 dark:text-neutral-300 dark:hover:text-red-400 px-5 py-3.5 rounded-xl font-bold transition-all text-xs border border-app-border"
              >
                <Trash2 size={16} />
                Kosongkan QRIS
              </button>

              <button
                disabled={isSaving}
                type="submit"
                className="flex-1 sm:flex-none flex items-center justify-center gap-3 bg-app-primary text-white px-8 py-3.5 rounded-xl font-bold hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-app-primary/20 text-xs sm:text-sm"
              >
                <Save size={18} />
                {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan QRIS'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ================= TAB 2: SIMULATION GENERATE QRIS ================= */}
      {activeTab === 'sim-generate' && (
        <div className="space-y-6">
          <div className="bg-app-card border border-app-border rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-app-border/50 pb-5 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-red-600 text-white font-mono text-xs font-black rounded-lg">POST</span>
                  <code className="text-sm font-mono font-bold text-app-text">{qrisData.apiEndpoint || '/api/qris/generate'}</code>
                </div>
                <p className="text-xs text-app-text-muted mt-1.5">
                  Uji coba simulasi pembuatan kode QRIS Dinamis standar EMVCo dengan nominal dan invoice ID real-time.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-app-text-muted">Header Auth:</span>
                <span className="text-xs font-mono font-bold px-2.5 py-1 bg-app-bg border border-app-border rounded-lg text-app-text">
                  X-API-Key: {qrisData.secretApiKey ? `${qrisData.secretApiKey.slice(0, 10)}...` : '(Kosong/Open)'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Simulator Form (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                <h4 className="text-xs font-black text-app-text uppercase tracking-widest flex items-center gap-2">
                  <Terminal size={16} className="text-red-600" />
                  Parameter Request Payload
                </h4>

                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-1 tracking-widest">
                    Nominal Transaksi (Rp)
                  </label>
                  <input
                    type="number"
                    value={simAmount}
                    onChange={(e) => setSimAmount(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-app-bg border border-app-border rounded-xl font-bold text-sm text-app-text"
                  />
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {[25000, 50000, 150000, 500000, 1000000].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSimAmount(val)}
                        className="text-[10px] font-bold px-2.5 py-1 bg-app-bg hover:bg-app-border border border-app-border rounded-lg text-app-text"
                      >
                        Rp {val.toLocaleString('id-ID')}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-1 tracking-widest">
                    Nomor Invoice / Order ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={simInvoiceId}
                      onChange={(e) => setSimInvoiceId(e.target.value)}
                      className="flex-1 px-4 py-2.5 bg-app-bg border border-app-border rounded-xl font-mono text-xs text-app-text"
                    />
                    <button
                      type="button"
                      onClick={() => setSimInvoiceId(`INV-${Date.now().toString().slice(-6)}`)}
                      className="px-3 py-2 bg-app-bg border border-app-border rounded-xl text-xs font-bold hover:bg-app-border text-app-text"
                      title="Generate ID baru"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-1 tracking-widest">
                    Nama Customer
                  </label>
                  <input
                    type="text"
                    value={simClientName}
                    onChange={(e) => setSimClientName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-app-bg border border-app-border rounded-xl text-xs text-app-text"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-1 tracking-widest">
                    Masa Berlaku QR (Menit)
                  </label>
                  <input
                    type="number"
                    value={simExpireMinutes}
                    onChange={(e) => setSimExpireMinutes(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-app-bg border border-app-border rounded-xl text-xs text-app-text"
                  />
                </div>

                <button
                  disabled={isGenerating}
                  type="button"
                  onClick={runSimulateGenerate}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-xl font-bold transition-all shadow-md shadow-red-600/20 active:scale-[0.98] disabled:opacity-50 text-xs uppercase tracking-wider"
                >
                  <Play size={16} />
                  {isGenerating ? 'Memproses Generate...' : 'Jalankan Simulasi Generate (POST)'}
                </button>
              </div>

              {/* Simulator Output (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                <h4 className="text-xs font-black text-app-text uppercase tracking-widest flex items-center gap-2">
                  <Code2 size={16} className="text-app-primary" />
                  Hasil Response API & Barcode QRIS
                </h4>

                {simError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 text-xs font-semibold flex items-start gap-2">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Generate Gagal:</p>
                      <p>{simError}</p>
                    </div>
                  </div>
                )}

                {simResult ? (
                  <div className="space-y-4 animate-in fade-in">
                    {/* Header info badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-app-bg border border-app-border rounded-xl text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          simResult.mode === 'EXTERNAL_PROXY' 
                            ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' 
                            : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                        }`}>
                          {simResult.mode === 'EXTERNAL_PROXY' ? 'EXTERNAL GATEWAY (PROXY)' : 'INTERNAL QRIS ENGINE'}
                        </span>
                        {simResult.httpStatus && (
                          <span className="text-[10px] bg-sky-500/10 text-sky-600 font-mono px-2 py-0.5 rounded font-bold">
                            HTTP {simResult.httpStatus} {simResult.statusText || 'OK'}
                          </span>
                        )}
                      </div>
                      {simResult.latencyMs !== undefined && (
                        <span className="text-[10px] text-app-text-muted font-mono flex items-center gap-1">
                          <Zap size={11} className="text-amber-500" />
                          {simResult.latencyMs} ms
                        </span>
                      )}
                    </div>

                    {/* Rendered QR Card */}
                    <div className="bg-white text-neutral-900 rounded-2xl p-5 border border-neutral-200 shadow-sm flex flex-col sm:flex-row items-center gap-6">
                      <div className="w-36 h-36 p-2 bg-white border-2 border-neutral-900 rounded-xl flex items-center justify-center shrink-0">
                        {simResult.qrisContent ? (
                          <QRCodeSVG value={simResult.qrisContent} size={128} level="M" />
                        ) : (
                          <div className="text-neutral-400 text-center p-2">
                            <QrCode size={36} className="mx-auto mb-1 text-neutral-300" />
                            <p className="text-[9px] font-semibold">QR Code Data Tidak Ditemukan</p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5 text-center sm:text-left flex-1">
                        <div className="flex items-center justify-center sm:justify-start gap-2">
                          <span className="text-xs font-black text-red-600">QRIS DINAMIS</span>
                          <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded font-bold">
                            {simResult.status || (simResult.success ? 'BERHASIL' : 'PENDING')}
                          </span>
                        </div>
                        <p className="text-base font-black text-neutral-900">
                          {simResult.formattedAmount || new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(simAmount)}
                        </p>
                        <p className="text-xs font-bold text-neutral-700">
                          {simResult.merchantName || qrisData.merchantName || settings.appName || 'NAMA MERCHANT'}
                        </p>
                        {simResult.transactionId && (
                          <p className="text-[11px] font-mono text-neutral-500">Tx: {simResult.transactionId}</p>
                        )}
                        <p className="text-[10px] text-neutral-400 flex items-center justify-center sm:justify-start gap-1">
                          <Clock size={12} />
                          Kadaluarsa: {simResult.expiresAt ? new Date(simResult.expiresAt).toLocaleTimeString('id-ID') : `${simExpireMinutes} Menit`}
                        </p>
                      </div>
                    </div>

                    {/* JSON Response View */}
                    <div className="bg-neutral-950 text-neutral-200 rounded-2xl p-4 border border-neutral-800 font-mono text-xs overflow-hidden">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800 text-[11px] text-neutral-400">
                        <span>{simResult.httpStatus ? `HTTP ${simResult.httpStatus} Response` : 'JSON Response'}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(JSON.stringify(simResult, null, 2), 'simJson')}
                          className="hover:text-white transition-colors flex items-center gap-1 font-sans"
                        >
                          {copiedField === 'simJson' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          Copy JSON
                        </button>
                      </div>
                      <pre className="overflow-x-auto max-h-60 text-[11px] leading-relaxed text-emerald-400">
                        {JSON.stringify(simResult, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 bg-app-bg border border-dashed border-app-border rounded-2xl text-center space-y-2">
                    <QrCode size={40} className="mx-auto text-app-text-muted/40" />
                    <p className="text-xs font-bold text-app-text">Belum ada request yang dijalankan</p>
                    <p className="text-[11px] text-app-text-muted max-w-sm mx-auto">
                      Klik tombol &quot;Jalankan Simulasi Generate (POST)&quot; untuk menguji coba payload QRIS EMVCo dan inspect respon JSON.
                    </p>
                  </div>
                )}

                {/* cURL Snippet */}
                <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 text-neutral-300 text-xs font-mono">
                  <div className="flex items-center justify-between mb-1.5 text-[10px] text-neutral-400 uppercase tracking-wider">
                    <span>Contoh Request cURL:</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(
                        `curl -X POST "${window.location.origin}${qrisData.apiEndpoint || '/api/qris/generate'}" \\\n  -H "Content-Type: application/json" \\\n  ${qrisData.secretApiKey ? `-H "X-API-Key: ${qrisData.secretApiKey}" \\\n  ` : ''}-d '{"amount": ${simAmount}, "invoiceId": "${simInvoiceId}", "clientName": "${simClientName}"}'`,
                        'curlReq'
                      )}
                      className="hover:text-white flex items-center gap-1"
                    >
                      {copiedField === 'curlReq' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      Copy cURL
                    </button>
                  </div>
                  <pre className="text-[10px] text-sky-300 overflow-x-auto whitespace-pre-wrap">
                    {`curl -X POST "${typeof window !== 'undefined' ? window.location.origin : ''}${qrisData.apiEndpoint || '/api/qris/generate'}" \\
  -H "Content-Type: application/json" \\
  ${qrisData.secretApiKey ? `-H "X-API-Key: ${qrisData.secretApiKey}" \\
  ` : ''}-d '{"amount": ${simAmount}, "invoiceId": "${simInvoiceId}", "clientName": "${simClientName}"}'`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: SIMULATION WEBHOOK CALLBACK ================= */}
      {activeTab === 'sim-webhook' && (
        <div className="space-y-6">
          <div className="bg-app-card border border-app-border rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-app-border/50 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-blue-600 text-white font-mono text-xs font-black rounded-lg">WEBHOOK</span>
                  <code className="text-sm font-mono font-bold text-app-text">POST /api/qris/webhook</code>
                </div>
                <p className="text-xs text-app-text-muted mt-1.5">
                  Simulasikan notifikasi HTTP POST callback dari Payment Gateway / Bank saat pembayaran QRIS berhasil diselesaikan.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchWebhookLogs}
                className="flex items-center gap-2 px-3 py-2 bg-app-bg border border-app-border rounded-xl text-xs font-bold text-app-text hover:bg-app-border transition-colors self-start"
              >
                <RefreshCw size={14} className={clsx(isLoadingLogs && "animate-spin")} />
                Refresh Logs
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Webhook Sender Trigger (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                <h4 className="text-xs font-black text-app-text uppercase tracking-widest flex items-center gap-2">
                  <Radio size={16} className="text-blue-600" />
                  Kirim Payload Simulasi Webhook
                </h4>

                {/* Target selector */}
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-1.5 tracking-widest">
                    Target Webhook URL
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setWhTargetMode('local')}
                      className={clsx(
                        "py-2 px-3 rounded-lg text-xs font-bold border text-center transition-all",
                        whTargetMode === 'local' 
                          ? "bg-blue-600 text-white border-blue-600" 
                          : "bg-app-bg border-app-border text-app-text hover:bg-app-border"
                      )}
                    >
                      Server Lokal
                    </button>
                    <button
                      type="button"
                      onClick={() => setWhTargetMode('custom')}
                      className={clsx(
                        "py-2 px-3 rounded-lg text-xs font-bold border text-center transition-all",
                        whTargetMode === 'custom' 
                          ? "bg-blue-600 text-white border-blue-600" 
                          : "bg-app-bg border-app-border text-app-text hover:bg-app-border"
                      )}
                    >
                      URL Kustom
                    </button>
                  </div>

                  {whTargetMode === 'custom' ? (
                    <input
                      type="text"
                      placeholder="https://webhook.site/xxxx atau URL external"
                      value={whCustomTarget}
                      onChange={(e) => setWhCustomTarget(e.target.value)}
                      className="w-full px-4 py-2.5 bg-app-bg border border-app-border rounded-xl font-mono text-xs text-app-text"
                    />
                  ) : (
                    <p className="text-[11px] font-mono text-app-text-muted bg-app-bg p-2 rounded-lg border border-app-border">
                      {defaultWebhookUrl}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-app-text-muted uppercase mb-1 tracking-widest">
                      Event Type
                    </label>
                    <select
                      value={whEvent}
                      onChange={(e) => setWhEvent(e.target.value)}
                      className="w-full px-3 py-2 bg-app-bg border border-app-border rounded-xl text-xs font-bold text-app-text"
                    >
                      <option value="payment.success">payment.success</option>
                      <option value="payment.pending">payment.pending</option>
                      <option value="payment.expired">payment.expired</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-app-text-muted uppercase mb-1 tracking-widest">
                      Status Transaksi
                    </label>
                    <select
                      value={whStatus}
                      onChange={(e) => setWhStatus(e.target.value)}
                      className="w-full px-3 py-2 bg-app-bg border border-app-border rounded-xl text-xs font-bold text-app-text"
                    >
                      <option value="PAID">PAID</option>
                      <option value="SETTLED">SETTLED</option>
                      <option value="PENDING">PENDING</option>
                      <option value="EXPIRED">EXPIRED</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-app-text-muted uppercase mb-1 tracking-widest">
                      Nominal Bayar (Rp)
                    </label>
                    <input
                      type="number"
                      value={whAmount}
                      onChange={(e) => setWhAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-app-bg border border-app-border rounded-xl text-xs font-bold text-app-text"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-app-text-muted uppercase mb-1 tracking-widest">
                      Sumber Bayar
                    </label>
                    <select
                      value={whProvider}
                      onChange={(e) => setWhProvider(e.target.value)}
                      className="w-full px-3 py-2 bg-app-bg border border-app-border rounded-xl text-xs font-bold text-app-text"
                    >
                      <option value="BCA Mobile">BCA Mobile</option>
                      <option value="Livin Mandiri">Livin Mandiri</option>
                      <option value="BRImo">BRImo</option>
                      <option value="GoPay">GoPay</option>
                      <option value="OVO">OVO</option>
                      <option value="DANA">DANA</option>
                      <option value="ShopeePay">ShopeePay</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-1 tracking-widest">
                    No. Invoice Terkait
                  </label>
                  <input
                    type="text"
                    value={whInvoiceId}
                    onChange={(e) => setWhInvoiceId(e.target.value)}
                    className="w-full px-3 py-2 bg-app-bg border border-app-border rounded-xl font-mono text-xs text-app-text"
                  />
                </div>

                <button
                  disabled={isSendingWebhook}
                  type="button"
                  onClick={runSimulateWebhook}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold transition-all shadow-md shadow-blue-600/20 active:scale-[0.98] disabled:opacity-50 text-xs uppercase tracking-wider"
                >
                  <Send size={16} />
                  {isSendingWebhook ? 'Mengirim Webhook...' : 'Kirim Simulasi Callback'}
                </button>

                {webhookResponse && (
                  <div className={clsx(
                    "p-4 rounded-xl text-xs font-mono border space-y-1",
                    webhookResponse.success 
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300" 
                      : "bg-red-500/10 border-red-500/30 text-red-600"
                  )}>
                    <div className="flex items-center justify-between font-bold">
                      <span>HTTP Status: {webhookResponse.httpStatus || 200}</span>
                      <span>Latency: {webhookResponse.latencyMs || 12}ms</span>
                    </div>
                    <p className="text-[11px] truncate">Target: {webhookResponse.targetUrl}</p>
                  </div>
                )}
              </div>

              {/* Webhook Log History Viewer (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-app-text uppercase tracking-widest flex items-center gap-2">
                    <Terminal size={16} className="text-app-primary" />
                    Incoming Webhook Logs ({webhookLogs.length})
                  </h4>
                  {webhookLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={clearWebhookLogs}
                      className="text-[11px] font-bold text-red-500 hover:underline flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      Clear Logs
                    </button>
                  )}
                </div>

                <div className="bg-neutral-950 text-neutral-200 rounded-2xl border border-neutral-800 p-4 space-y-3 min-h-[350px] max-h-[500px] overflow-y-auto font-mono text-xs">
                  {webhookLogs.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-neutral-500 text-center p-4">
                      <Radio size={36} className="mb-2 text-neutral-700" />
                      <p className="text-xs font-bold text-neutral-400">Belum ada incoming webhook callback</p>
                      <p className="text-[11px] max-w-xs mt-1">
                        Gunakan form di samping untuk men-trigger simulasi callback transaksi QRIS secara real-time.
                      </p>
                    </div>
                  ) : (
                    webhookLogs.map((log) => (
                      <div key={log.id} className="p-3 bg-neutral-900 rounded-xl border border-neutral-800 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            {log.payload?.event || 'payment.success'}
                          </span>
                          <span className="text-neutral-500">
                            {new Date(log.timestamp).toLocaleTimeString('id-ID')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-400 bg-neutral-950 p-2 rounded-lg">
                          <div>Invoice: <span className="text-white font-bold">{log.payload?.invoiceId || '-'}</span></div>
                          <div>Status: <span className="text-emerald-400 font-bold">{log.payload?.status || 'PAID'}</span></div>
                          <div>Nominal: <span className="text-white font-bold">Rp {(log.payload?.amount || 0).toLocaleString('id-ID')}</span></div>
                          <div>Provider: <span className="text-sky-300 font-bold">{log.payload?.paymentProvider || 'QRIS'}</span></div>
                        </div>
                        <details className="text-[10px] text-neutral-500">
                          <summary className="cursor-pointer hover:text-neutral-300">Lihat Raw JSON Payload & Headers</summary>
                          <pre className="mt-2 p-2 bg-black rounded text-neutral-300 overflow-x-auto">
                            {JSON.stringify(log, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
