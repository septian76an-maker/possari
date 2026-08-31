import express from "express";
import path from "path";
import { Resend } from 'resend';
import dotenv from 'dotenv';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

dotenv.config();

let firebaseAdminApp: App | null = null;
let adminDb: Firestore | null = null;

// Initialize Firebase Admin securely from Environment Variable
try {
  if (!getApps().length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf-8'));
      firebaseAdminApp = initializeApp({
        credential: cert(serviceAccount)
      });
      adminDb = getFirestore(firebaseAdminApp);
      console.log("[Firebase Admin] Initialized successfully via Base64 ENV");
    } else {
      // Fallback to application default credentials (works on GCP Cloud Run/App Engine)
      firebaseAdminApp = initializeApp({
        projectId: 'ai-studio-d9d4575e-7171-4bb8-b126-d142a9ba502c'
      });
      adminDb = getFirestore(firebaseAdminApp);
      console.log("[Firebase Admin] Initialized with Default Credentials / Project ID");
    }
  } else {
    firebaseAdminApp = getApps()[0];
    adminDb = getFirestore(firebaseAdminApp);
  }
} catch (error) {
  console.warn("[Firebase Admin] Failed to initialize. Firestore webhook updates will fallback to memory only.", error);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Add support for form-encoded webhooks

// Lazy initialization for Resend
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY is not set in environment variables.");
    }
    resendClient = new Resend(key);
  }
  return resendClient;
}

// In-memory store for recent webhook events (max 50)
interface WebhookLogEntry {
  id: string;
  timestamp: string;
  source: string;
  headers: Record<string, string | string[] | undefined>;
  payload: any;
  status: 'PROCESSED' | 'RECEIVED' | 'FAILED';
}

const webhookLogs: WebhookLogEntry[] = [];

// In-memory store for confirmed paid transactions from Webhook / Gateway
interface PaidTransactionRecord {
  invoiceId: string;
  transactionId: string;
  amount: number;
  paidAt: string;
  status: string;
  paymentSource?: string;
  rawPayload?: any;
}

const paidTransactions = new Map<string, PaidTransactionRecord>();

function normalizeKey(str: string): string {
  if (!str) return '';
  return str.trim().toLowerCase().replace(/^inv-/, '').replace(/[^a-z0-9]/g, '');
}

function recordPaymentSuccess(rawPayload: any, customInvoiceId?: string, customTxId?: string, customAmount?: number): PaidTransactionRecord {
  const p = rawPayload || {};
  const data = p.data || p.result || p.transaction || {};

  // Extract Transaction ID
  const detectedTxId = customTxId ||
    p.transaction_id || p.transactionId || p.trx_id || p.trxId || p.payment_id || p.paymentId ||
    data.transaction_id || data.transactionId || data.trx_id || data.trxId ||
    p.id || data.id ||
    `TX-${Date.now()}`;

  // Extract Invoice ID from any possible gateway payload schema
  const detectedInvoiceId = customInvoiceId || 
    p.invoice_id || p.invoiceId || p.order_id || p.orderId || p.ref_id || p.reference_id || p.bill_no || p.billNo ||
    data.invoice_id || data.invoiceId || data.order_id || data.orderId || data.ref_id || data.reference_id || '';

  // Extract Amount
  const detectedAmount = customAmount ||
    Number(p.amount || p.nominal || p.total || p.gross_amount || data.amount || data.nominal || data.total || 0);

  // Extract Payment Source
  const detectedSource = p.provider || p.payment_source || p.payment_method || p.bank || data.provider || data.payment_method || 'QRIS Dinamis';

  const record: PaidTransactionRecord = {
    invoiceId: String(detectedInvoiceId),
    transactionId: String(detectedTxId),
    amount: detectedAmount,
    paidAt: new Date().toISOString(),
    status: 'PAID',
    paymentSource: detectedSource,
    rawPayload: p
  };

  // Register in map under multiple normalized keys so lookups never miss
  if (record.invoiceId) {
    paidTransactions.set(record.invoiceId, record);
    paidTransactions.set(normalizeKey(record.invoiceId), record);
  }
  if (record.transactionId) {
    paidTransactions.set(record.transactionId, record);
    paidTransactions.set(normalizeKey(record.transactionId), record);
  }

  return record;
}

// Helper: Calculate CRC16 CCITT for standard EMVCo QRIS
function calculateCRC16(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatTLV(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

// Parse EMVCo / QRIS string to extract tags (Merchant Name tag 59, NMID tag 26/51 subtag 01/02, City tag 60, etc.)
function parseEMVCoQRIS(qrisString: string): {
  merchantName?: string;
  nmid?: string;
  city?: string;
  postalCode?: string;
  amount?: number;
  currency?: string;
} {
  const result: {
    merchantName?: string;
    nmid?: string;
    city?: string;
    postalCode?: string;
    amount?: number;
    currency?: string;
  } = {};

  if (!qrisString || typeof qrisString !== 'string') return result;

  const raw = qrisString.trim();
  let index = 0;

  while (index < raw.length - 4) {
    const tag = raw.substring(index, index + 2);
    const lengthStr = raw.substring(index + 2, index + 4);
    const length = parseInt(lengthStr, 10);

    if (isNaN(length) || length <= 0 || index + 4 + length > raw.length) {
      break;
    }

    const value = raw.substring(index + 4, index + 4 + length);

    if (tag === '59') {
      result.merchantName = value.trim();
    } else if (tag === '60') {
      result.city = value.trim();
    } else if (tag === '61') {
      result.postalCode = value.trim();
    } else if (tag === '54') {
      const num = parseFloat(value);
      if (!isNaN(num)) result.amount = num;
    } else if (tag === '53') {
      result.currency = value.trim();
    } else if ((parseInt(tag, 10) >= 26 && parseInt(tag, 10) <= 51)) {
      let subIndex = 0;
      while (subIndex < value.length) {
        const subTag = value.substring(subIndex, subIndex + 2);
        const subLengthStr = value.substring(subIndex + 2, subIndex + 4);
        const subLength = parseInt(subLengthStr, 10);
        if (isNaN(subLength) || subLength <= 0 || subIndex + 4 + subLength > value.length) {
          break;
        }
        const subValue = value.substring(subIndex + 4, subIndex + 4 + subLength);
        if (subTag === '01' || subTag === '02' || subTag === '03') {
          if (subValue.toUpperCase().startsWith('ID') || /^[0-9A-Z]{9,25}$/i.test(subValue)) {
            result.nmid = subValue.trim();
          }
        }
        subIndex += 4 + subLength;
      }
    }

    index += 4 + length;
  }

  if (!result.nmid) {
    const nmidMatch = raw.match(/ID[0-9]{9,18}/i);
    if (nmidMatch) {
      result.nmid = nmidMatch[0].toUpperCase();
    }
  }

  return result;
}

// Generate valid standard Indonesian QRIS dynamic payload
function generateEMVCoQRIS(params: {
  merchantName: string;
  nmid?: string;
  invoiceId: string;
  amount: number;
  city?: string;
  postalCode?: string;
}): string {
  const merchantNameClean = (params.merchantName || 'MERCHANT QRIS').toUpperCase().slice(0, 25);
  const cityClean = (params.city || 'INDONESIA').toUpperCase().slice(0, 15);
  const postal = params.postalCode || '10110';
  const nmidClean = params.nmid || 'ID1020000000000';

  // Sub-tags for Merchant Account Information (Tag 26)
  const tag26Sub00 = formatTLV('00', 'ID.CO.QRIS.WWW');
  const tag26Sub01 = formatTLV('01', nmidClean);
  const tag26Sub02 = formatTLV('02', '00000');
  const tag26Sub03 = formatTLV('03', 'UME');
  const tag26 = formatTLV('26', `${tag26Sub00}${tag26Sub01}${tag26Sub02}${tag26Sub03}`);

  // Sub-tags for Additional Data Field (Tag 62)
  const tag62Sub01 = formatTLV('01', params.invoiceId.slice(0, 20));
  const tag62Sub07 = formatTLV('07', 'A01');
  const tag62 = formatTLV('62', `${tag62Sub01}${tag62Sub07}`);

  let raw = '';
  raw += formatTLV('00', '01'); // Format Indicator
  raw += formatTLV('01', '12'); // Point of Initiation (12 = Dynamic QR)
  raw += tag26;                 // Merchant Account Information
  raw += formatTLV('51', formatTLV('00', 'ID.CO.QRIS.WWW') + formatTLV('02', nmidClean));
  raw += formatTLV('52', '5812'); // Merchant Category Code
  raw += formatTLV('53', '360');  // Currency: IDR (360)
  raw += formatTLV('54', Math.round(params.amount).toString()); // Transaction Amount
  raw += formatTLV('58', 'ID');   // Country Code
  raw += formatTLV('59', merchantNameClean); // Merchant Name
  raw += formatTLV('60', cityClean);         // Merchant City
  raw += formatTLV('61', postal);            // Postal Code
  raw += tag62;                              // Additional Data Field
  raw += '6304';                             // CRC Tag Header

  const checksum = calculateCRC16(raw);
  return `${raw}${checksum}`;
}

// -------------------------------------------------------------
// QRIS API Routes
// -------------------------------------------------------------

// Deep recursive scanner to find standard EMVCo payload (starting with 000201), image URLs, and transaction metadata anywhere in API responses
function extractQrisDetailsFromObject(obj: any): {
  qrisContent?: string;
  qrImageUrl?: string;
  transactionId?: string;
  merchantName?: string;
  nmid?: string;
  expiresAt?: string;
} {
  const result: {
    qrisContent?: string;
    qrImageUrl?: string;
    transactionId?: string;
    merchantName?: string;
    nmid?: string;
    expiresAt?: string;
  } = {};

  if (!obj || typeof obj !== 'object') return result;

  function traverse(current: any, keyPath: string = '') {
    if (!current) return;

    if (typeof current === 'string') {
      const trimmed = current.trim();
      const lowerKey = keyPath.toLowerCase();

      // Check if it is a raw EMVCo QRIS string (starts with 000201)
      if (trimmed.startsWith('000201') && trimmed.length > 30) {
        if (!result.qrisContent) {
          result.qrisContent = trimmed;
        }
      }
      // Check if it is a QR image URL, link, or Data URI
      else if (
        (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) &&
        (lowerKey.includes('qr') || lowerKey.includes('image') || lowerKey.includes('link') || lowerKey.includes('url') || lowerKey.includes('barcode') || trimmed.includes('.png') || trimmed.includes('.jpg') || trimmed.includes('.svg') || trimmed.includes('chart.googleapis.com'))
      ) {
        if (!result.qrImageUrl && !lowerKey.includes('webhook') && !lowerKey.includes('callback') && !lowerKey.includes('notify') && !lowerKey.includes('redirect')) {
          result.qrImageUrl = trimmed;
        }
      }
      // Check for transaction reference / ID
      else if (
        (lowerKey.includes('transaction') || lowerKey.includes('order_id') || lowerKey.includes('orderid') || lowerKey.includes('ref_id') || lowerKey.includes('refid') || lowerKey.includes('referenceno') || lowerKey.includes('reference_id') || lowerKey.includes('referenceid') || lowerKey === 'id' || lowerKey.endsWith('.id')) &&
        trimmed.length >= 2 &&
        trimmed.length < 100
      ) {
        if (!result.transactionId) {
          result.transactionId = trimmed;
        }
      }
      // Check for merchant name
      else if (
        (lowerKey.includes('merchant_name') || lowerKey.includes('merchantname') || lowerKey === 'merchant' || lowerKey.endsWith('.merchant')) &&
        trimmed.length > 1 &&
        trimmed.length < 100
      ) {
        if (!result.merchantName) {
          result.merchantName = trimmed;
        }
      }
      // Check for NMID
      else if (
        (lowerKey.includes('nmid') || lowerKey.includes('merchant_id') || lowerKey.includes('merchantid')) &&
        trimmed.length > 5 &&
        trimmed.length < 35
      ) {
        if (!result.nmid) {
          result.nmid = trimmed;
        }
      }
      // Check for expiry date
      else if (
        (lowerKey.includes('expire') || lowerKey.includes('expiry') || lowerKey.includes('valid')) &&
        (trimmed.includes('T') || trimmed.includes('-') || trimmed.includes(':'))
      ) {
        if (!result.expiresAt) {
          result.expiresAt = trimmed;
        }
      }
      return;
    }

    if (typeof current === 'number') {
      const lowerKey = keyPath.toLowerCase();
      if ((lowerKey.includes('transaction') || lowerKey.includes('order_id') || lowerKey === 'id') && !result.transactionId) {
        result.transactionId = String(current);
      }
      return;
    }

    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        traverse(current[i], `${keyPath}[${i}]`);
      }
      return;
    }

    for (const [k, v] of Object.entries(current)) {
      traverse(v, keyPath ? `${keyPath}.${k}` : k);
    }
  }

  traverse(obj);
  return result;
}

// In-memory store for active QRIS transactions (prevents duplicate generations on gateway)
interface CachedQrisSession {
  invoiceId: string;
  amount: number;
  transactionId: string;
  qrisContent?: string;
  qrImageUrl?: string;
  merchantName?: string;
  nmid?: string;
  expiresAt: string;
  createdAt: string;
  mode: string;
  endpointUsed: string;
  response?: any;
}

const activeQrisSessions = new Map<string, CachedQrisSession>();

// 0. Proxy Endpoint: POST /api/qris/proxy-generate (Bypasses CORS for external API URLs)
app.post("/api/qris/proxy-generate", async (req, res) => {
  const { apiEndpoint, secretApiKey, payload, forceRefresh } = req.body;
  const targetEndpoint = (apiEndpoint || '').trim();
  const port = Number(process.env.PORT) || 3000;
  const isLocal = !targetEndpoint || 
                  targetEndpoint === '/api/qris/generate' || 
                  targetEndpoint.startsWith('/api/') || 
                  targetEndpoint.includes(`localhost:${port}`) ||
                  targetEndpoint.includes('127.0.0.1');

  const reqPayload = payload || {};
  const numericAmount = Number(reqPayload.amount) || 0;
  const invoiceNumber = reqPayload.invoiceId || `INV-${Date.now().toString().slice(-6)}`;
  const targetMerchant = reqPayload.merchantName || 'SEPTIAN NETWORK';
  const targetNmid = reqPayload.nmid || 'ID102003849102';

  if (!numericAmount || numericAmount <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid amount. Field 'amount' must be a positive number."
    });
  }

  // Check if an active session already exists for this invoice (unless forceRefresh requested)
  if (!forceRefresh) {
    // 1. Check in-memory map
    const cached = activeQrisSessions.get(invoiceNumber);
    if (cached && cached.amount === numericAmount) {
      const remainingMs = new Date(cached.expiresAt).getTime() - Date.now();
      if (remainingMs > 30000) { // More than 30s remaining
        console.log(`[Proxy QRIS] Reusing active in-memory QRIS session for Invoice #${invoiceNumber} (TxId: ${cached.transactionId})`);
        return res.json({
          success: true,
          mode: cached.mode || "EXTERNAL_PROXY",
          endpointUsed: cached.endpointUsed || targetEndpoint,
          qrisContent: cached.qrisContent,
          qrImageUrl: cached.qrImageUrl,
          transactionId: cached.transactionId,
          merchantName: cached.merchantName || targetMerchant,
          nmid: cached.nmid || targetNmid,
          amount: cached.amount,
          expiresAt: cached.expiresAt,
          isReused: true,
          response: cached.response,
          message: "Menggunakan data QRIS aktif yang sudah ada (tidak membuat transaksi baru)."
        });
      }
    }

    // 2. Check Firestore if admin is initialized
    if (adminDb) {
      try {
        const invDoc = await adminDb.collection('invoices').doc(invoiceNumber).get();
        if (invDoc.exists) {
          const invData = invDoc.data();
          const qrisData = invData?.qrisData;
          if (qrisData && (qrisData.amount === numericAmount || !qrisData.amount) && (qrisData.qrisContent || qrisData.qrImageUrl)) {
            const expiresTime = qrisData.expiresAt ? new Date(qrisData.expiresAt).getTime() : (Date.now() + 15 * 60 * 1000);
            if (expiresTime > Date.now() + 30000) {
              const sessionObj: CachedQrisSession = {
                invoiceId: invoiceNumber,
                amount: numericAmount,
                transactionId: qrisData.transactionId || `TX-${invoiceNumber}`,
                qrisContent: qrisData.qrisContent,
                qrImageUrl: qrisData.qrImageUrl,
                merchantName: qrisData.merchantName || targetMerchant,
                nmid: qrisData.nmid || targetNmid,
                expiresAt: qrisData.expiresAt || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                createdAt: qrisData.createdAt || new Date().toISOString(),
                mode: qrisData.mode || "EXTERNAL_PROXY",
                endpointUsed: targetEndpoint
              };
              activeQrisSessions.set(invoiceNumber, sessionObj);
              console.log(`[Proxy QRIS] Loaded & Reusing active QRIS from Firestore for Invoice #${invoiceNumber} (TxId: ${sessionObj.transactionId})`);
              return res.json({
                success: true,
                mode: sessionObj.mode,
                endpointUsed: targetEndpoint,
                qrisContent: sessionObj.qrisContent,
                qrImageUrl: sessionObj.qrImageUrl,
                transactionId: sessionObj.transactionId,
                merchantName: sessionObj.merchantName,
                nmid: sessionObj.nmid,
                amount: numericAmount,
                expiresAt: sessionObj.expiresAt,
                isReused: true,
                message: "Menggunakan data QRIS aktif dari database (tidak membuat transaksi baru)."
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[Proxy QRIS] Error reading Firestore cache for #${invoiceNumber}:`, err);
      }
    }
  }

  // If local endpoint or default relative path
  if (isLocal) {
    const expirationMin = reqPayload.expireMinutes ? Number(reqPayload.expireMinutes) : 30;
    const expiresAt = new Date(Date.now() + expirationMin * 60 * 1000).toISOString();
    const transactionId = `QRIS-TX-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const qrisString = generateEMVCoQRIS({
      merchantName: targetMerchant,
      nmid: targetNmid,
      invoiceId: invoiceNumber,
      amount: numericAmount,
      city: reqPayload.city || 'JAKARTA'
    });

    const formattedAmount = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(numericAmount);

    return res.json({
      success: true,
      mode: "INTERNAL_LOCAL",
      endpointUsed: targetEndpoint || "/api/qris/generate",
      status: "PENDING",
      transactionId,
      invoiceId: invoiceNumber,
      merchantName: targetMerchant,
      nmid: targetNmid,
      clientName: reqPayload.clientName || 'Umum',
      amount: numericAmount,
      formattedAmount,
      description: reqPayload.description || `Pembayaran Invoice #${invoiceNumber}`,
      qrisContent: qrisString,
      authMethod: secretApiKey ? "X-API-Key Authenticated" : "Open Mode",
      createdAt: new Date().toISOString(),
      expiresAt,
      paymentMethodsAllowed: ["BCA", "Mandiri", "BRI", "BNI", "GoPay", "OVO", "DANA", "ShopeePay", "LinkAja"],
      message: "Dynamic QRIS payload generated successfully (Internal Engine)."
    });
  }

  // External URL call via Node.js server (No Browser CORS restrictions)
  let fullUrl = targetEndpoint;
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    fullUrl = `https://${fullUrl}`;
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*"
    };

    if (secretApiKey) {
      headers["X-API-Key"] = secretApiKey;
      headers["X-Api-Key"] = secretApiKey;
      headers["api-key"] = secretApiKey;
      headers["Authorization"] = `Bearer ${secretApiKey}`;
    }

    // Comprehensive payload matching standard Indonesian QRIS / QRISAN gateways
    const enrichedPayload = {
      ...reqPayload,
      amount: numericAmount,
      nominal: numericAmount,
      total: numericAmount,
      invoice_id: invoiceNumber,
      invoiceId: invoiceNumber,
      order_id: invoiceNumber,
      ref_id: invoiceNumber,
      merchant_name: targetMerchant,
      merchantName: targetMerchant,
      customer_name: reqPayload.clientName || 'Pelanggan',
      clientName: reqPayload.clientName || 'Pelanggan',
      name: reqPayload.clientName || 'Pelanggan',
      nmid: targetNmid,
      expire_minutes: reqPayload.expireMinutes || 30,
      expired_time: reqPayload.expireMinutes || 30,
      callback_url: reqPayload.webhookUrl || reqPayload.callbackUrl || '',
      webhook_url: reqPayload.webhookUrl || reqPayload.callbackUrl || ''
    };

    const externalResponse = await fetch(fullUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(enrichedPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    const responseText = await externalResponse.text();
    let responseData: any = null;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { rawResponse: responseText };
    }

    // Comprehensive normalization using recursive extractor for various Indonesian QRIS API providers (QRISAN, SPE Solution, Qrisku, Midtrans, Xendit, Tripay, etc.)
    const deepExtracted = extractQrisDetailsFromObject(responseData);

    let extractedQrisContent = deepExtracted.qrisContent || '';
    let extractedQrImage = deepExtracted.qrImageUrl || '';
    let extractedTxId = deepExtracted.transactionId || `TX-${Date.now()}`;
    let extractedExpiresAt = deepExtracted.expiresAt || new Date(Date.now() + 30 * 60 * 1000).toISOString();
    let extractedMerchant = deepExtracted.merchantName || targetMerchant;
    let extractedNmid = deepExtracted.nmid || targetNmid;

    // Check direct object mappings as well
    if (responseData && typeof responseData === 'object') {
      const d = responseData.data || responseData.result || responseData.results || responseData;
      
      if (!extractedQrisContent) {
        extractedQrisContent = d.qrisContent || 
                               d.qris_content || 
                               d.qr_string || 
                               d.qrString || 
                               d.qr_code || 
                               d.qrCode || 
                               d.qris_data || 
                               d.qrisData || 
                               d.raw_qr || 
                               d.rawQr || 
                               d.qris || 
                               d.qr || 
                               d.payload || 
                               responseData.qrisContent ||
                               responseData.qris_content ||
                               responseData.qr_string ||
                               responseData.qrString ||
                               responseData.qr_code ||
                               responseData.qrCode ||
                               responseData.qris ||
                               responseData.qr ||
                               '';
      }

      if (!extractedQrImage) {
        extractedQrImage = d.qr_image || 
                           d.qr_image_url || 
                           d.qr_url || 
                           d.qrImageUrl || 
                           d.qrUrl || 
                           d.qr_link || 
                           d.qrLink || 
                           d.image || 
                           d.image_url || 
                           d.imageUrl || 
                           d.qr_image_base64 || 
                           d.qrImageBase64 || 
                           responseData.qr_image ||
                           responseData.qr_image_url ||
                           responseData.qr_url ||
                           responseData.qr_link ||
                           responseData.qrLink ||
                           '';
      }

      // If we have a genuine QR string returned by QRISAN, parse EMVCo to extract exact Merchant Name & NMID from the QR itself
      if (extractedQrisContent) {
        const parsedFromQr = parseEMVCoQRIS(extractedQrisContent);
        if (parsedFromQr.merchantName) {
          extractedMerchant = parsedFromQr.merchantName;
        }
        if (parsedFromQr.nmid) {
          extractedNmid = parsedFromQr.nmid;
        }
      }
    }

    // Only use synthetic fallback if no genuine QR string OR QR image was returned from the gateway
    if (!extractedQrisContent && !extractedQrImage && externalResponse.ok) {
      extractedQrisContent = generateEMVCoQRIS({
        merchantName: extractedMerchant || targetMerchant,
        nmid: extractedNmid || targetNmid,
        invoiceId: invoiceNumber,
        amount: numericAmount
      });
    }

    const finalExpiresAt = extractedExpiresAt || new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // Cache the active session so reopening invoice won't duplicate QRIS on external server
    if (externalResponse.ok && (extractedQrisContent || extractedQrImage)) {
      const sessionToCache: CachedQrisSession = {
        invoiceId: invoiceNumber,
        amount: numericAmount,
        transactionId: extractedTxId,
        qrisContent: extractedQrisContent,
        qrImageUrl: extractedQrImage,
        merchantName: extractedMerchant,
        nmid: extractedNmid,
        expiresAt: finalExpiresAt,
        createdAt: new Date().toISOString(),
        mode: "EXTERNAL_PROXY",
        endpointUsed: fullUrl,
        response: responseData
      };
      activeQrisSessions.set(invoiceNumber, sessionToCache);

      // Async persist to Firestore if available
      if (adminDb) {
        adminDb.collection('invoices').doc(invoiceNumber).set({
          qrisData: {
            transactionId: extractedTxId,
            qrisContent: extractedQrisContent || '',
            qrImageUrl: extractedQrImage || '',
            merchantName: extractedMerchant || targetMerchant,
            nmid: extractedNmid || targetNmid,
            amount: numericAmount,
            expiresAt: finalExpiresAt,
            createdAt: new Date().toISOString(),
            mode: "EXTERNAL_PROXY"
          }
        }, { merge: true }).catch(err => {
          console.warn(`[Proxy QRIS] Firestore set qrisData error:`, err);
        });
      }
    }

    return res.json({
      success: externalResponse.ok,
      mode: "EXTERNAL_PROXY",
      endpointUsed: fullUrl,
      httpStatus: externalResponse.status,
      statusText: externalResponse.statusText,
      latencyMs: latency,
      qrisContent: extractedQrisContent,
      qrImageUrl: extractedQrImage,
      transactionId: extractedTxId,
      merchantName: extractedMerchant,
      nmid: extractedNmid,
      amount: numericAmount,
      expiresAt: finalExpiresAt,
      response: responseData,
      rawBody: typeof responseData === 'object' ? responseData : responseText
    });
  } catch (error) {
    const latency = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const errorMsg = isTimeout 
      ? `Request Timeout ke ${fullUrl} setelah 15 detik. Pastikan server eksternal aktif dan dapat diakses.` 
      : (error instanceof Error ? error.message : "Gagal terhubung ke Base URL eksternal.");

    return res.status(502).json({
      success: false,
      mode: "EXTERNAL_PROXY",
      endpointUsed: fullUrl,
      latencyMs: latency,
      error: errorMsg,
      hint: "Pastikan URL endpoint benar, mendukung method POST, dan server target dapat menerima request dari internet."
    });
  }
});

// 0.1 Proxy Endpoint to Check and Sync Merchant Profile & NMID from QRISAN Server: POST /api/qris/check-profile
app.post("/api/qris/check-profile", async (req, res) => {
  const { apiEndpoint, secretApiKey, staticQrisContent } = req.body;
  const targetEndpoint = (apiEndpoint || '').trim();

  // If user provided a static QRIS string directly, parse it immediately
  if (staticQrisContent && typeof staticQrisContent === 'string' && staticQrisContent.startsWith('000201')) {
    const parsed = parseEMVCoQRIS(staticQrisContent);
    return res.json({
      success: true,
      source: "PARSED_QRIS_STRING",
      merchantName: parsed.merchantName || 'MERCHANT QRIS',
      nmid: parsed.nmid || 'ID1020000000000',
      city: parsed.city || 'INDONESIA',
      postalCode: parsed.postalCode || '10110',
      message: "Data Merchant & NMID berhasil diekstrak otomatis dari payload QRIS."
    });
  }

  // If no external URL or default local endpoint
  if (!targetEndpoint || targetEndpoint === '/api/qris/generate' || targetEndpoint.startsWith('/api/')) {
    return res.json({
      success: true,
      source: "INTERNAL_DEFAULT",
      merchantName: "SEPTIAN NETWORK",
      nmid: "ID102003849102",
      message: "Menggunakan profil default server lokal."
    });
  }

  let fullUrl = targetEndpoint;
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    fullUrl = `https://${fullUrl}`;
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*"
    };

    if (secretApiKey) {
      headers["X-API-Key"] = secretApiKey;
      headers["X-Api-Key"] = secretApiKey;
      headers["api-key"] = secretApiKey;
      headers["Authorization"] = `Bearer ${secretApiKey}`;
    }

    // Try a probe request with 1 IDR to fetch merchant name and NMID from gateway response
    const probeResponse = await fetch(fullUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: 1000,
        nominal: 1000,
        total: 1000,
        invoice_id: `PROBE-${Date.now().toString().slice(-4)}`,
        invoiceId: `PROBE-${Date.now().toString().slice(-4)}`,
        order_id: `PROBE-${Date.now().toString().slice(-4)}`,
        customer_name: 'Pemeriksaan Profil',
        clientName: 'Pemeriksaan Profil',
        expire_minutes: 5
      })
    });

    const responseText = await probeResponse.text();
    let responseData: any = null;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { rawResponse: responseText };
    }

    let merchantName = '';
    let nmid = '';
    let qrisContent = '';

    if (responseData && typeof responseData === 'object') {
      const d = responseData.data || responseData.result || responseData.results || responseData;
      merchantName = d.merchant_name || d.merchantName || d.merchant || responseData.merchant_name || responseData.merchantName || '';
      nmid = d.nmid || d.NMID || d.merchant_id || d.merchantId || responseData.nmid || responseData.NMID || '';
      qrisContent = d.qrisContent || d.qris_content || d.qr_string || d.qrString || d.qr_code || d.qrCode || d.qris || d.qr || '';

      if (qrisContent) {
        const parsed = parseEMVCoQRIS(qrisContent);
        if (parsed.merchantName && !merchantName) merchantName = parsed.merchantName;
        if (parsed.nmid && !nmid) nmid = parsed.nmid;
      }
    }

    if (merchantName || nmid) {
      return res.json({
        success: true,
        source: "QRISAN_SERVER",
        merchantName: merchantName || 'SEPTIAN NETWORK',
        nmid: nmid || 'ID102003849102',
        rawResponse: responseData,
        message: `Berhasil mengambil identitas dari server QRISAN: ${merchantName} (${nmid})`
      });
    }

    return res.json({
      success: probeResponse.ok,
      source: "QRISAN_RAW",
      merchantName: merchantName || 'SEPTIAN NETWORK',
      nmid: nmid || 'ID102003849102',
      rawResponse: responseData,
      message: "Respon server diterima. Silakan periksa data merchant."
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Gagal menghubungi server QRISAN untuk mengambil profil'
    });
  }
});

// 1. Endpoint API: POST /api/qris/generate
app.post("/api/qris/generate", (req, res) => {
  const apiKey = (req.headers['x-api-key'] || req.headers['X-API-Key'] || req.query.apiKey) as string | undefined;
  const { amount, invoiceId, clientName, merchantName, nmid, city, expireMinutes, description } = req.body;

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid amount. Field 'amount' must be a positive number."
    });
  }

  const invoiceNumber = invoiceId || `INV-${Date.now().toString().slice(-6)}`;
  const transactionId = `QRIS-TX-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const targetMerchant = merchantName || 'SEPTIAN NETWORK';
  const numericAmount = Number(amount);
  const expirationMin = expireMinutes ? Number(expireMinutes) : 30;
  const expiresAt = new Date(Date.now() + expirationMin * 60 * 1000).toISOString();

  // Generate EMVCo QR string
  const qrisString = generateEMVCoQRIS({
    merchantName: targetMerchant,
    nmid: nmid || 'ID102003849102',
    invoiceId: invoiceNumber,
    amount: numericAmount,
    city: city || 'JAKARTA'
  });

  const formattedAmount = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(numericAmount);

  res.json({
    success: true,
    status: "PENDING",
    transactionId,
    invoiceId: invoiceNumber,
    merchantName: targetMerchant,
    nmid: nmid || 'ID102003849102',
    clientName: clientName || 'Umum',
    amount: numericAmount,
    formattedAmount,
    description: description || `Pembayaran Invoice #${invoiceNumber}`,
    qrisContent: qrisString,
    authMethod: apiKey ? "X-API-Key Authenticated" : "Open Mode",
    createdAt: new Date().toISOString(),
    expiresAt,
    paymentMethodsAllowed: ["BCA", "Mandiri", "BRI", "BNI", "GoPay", "OVO", "DANA", "ShopeePay", "LinkAja"],
    message: "Dynamic QRIS payload generated successfully."
  });
});

// 2. Endpoint: POST /api/qris/payment-callback (Receives gateway callbacks)
app.post("/api/qris/payment-callback", async (req, res) => {
  const payload = req.body || {};
  console.log("[QRIS Webhook] Received payload:", JSON.stringify(payload));
  
  const statusStr = String(
    payload.status || payload.payment_status || payload.transaction_status || 
    payload.state || payload.event || payload.data?.status || payload.data?.payment_status || 'PAID'
  ).toUpperCase();

  const isSuccess = statusStr.includes('PAID') || 
                    statusStr.includes('SUCCESS') || 
                    statusStr.includes('SETTLED') || 
                    statusStr.includes('COMPLETED') || 
                    statusStr.includes('00') ||
                    statusStr === '0' ||
                    statusStr === 'SUKSES' ||
                    statusStr === 'BERHASIL' ||
                    statusStr === 'LUNAS' ||
                    payload.event === 'payment.success';

  let record: PaidTransactionRecord | null = null;
  if (isSuccess) {
    record = recordPaymentSuccess(payload);
    console.log(`[QRIS Webhook] Processed Success Record for Invoice: ${record.invoiceId || 'UNKNOWN'}`);

    // Attempt to update Firestore directly via Admin SDK
    try {
      if (adminDb) {
        if (record.invoiceId) {
          console.log(`[QRIS Webhook] Attempting Firestore update for doc: ${record.invoiceId}`);
          await adminDb.collection('invoices').doc(record.invoiceId).update({
            status: 'paid',
            paidAt: record.paidAt,
            paymentMethod: record.paymentSource || 'QRIS Dinamis'
          });
          console.log(`[QRIS Webhook] Firebase Firestore successfully updated for Invoice #${record.invoiceId}`);
        } else {
          console.warn(`[QRIS Webhook] Skipping Firestore update: invoiceId is empty. Received body keys:`, Object.keys(payload));
        }
      } else {
         console.warn(`[QRIS Webhook] Skipping Firestore update: Admin SDK not initialized (Missing FIREBASE_SERVICE_ACCOUNT in ENV).`);
      }
    } catch (dbError: any) {
      console.warn(`[QRIS Webhook] Could not update Firestore. Error: ${dbError.message}`);
    }
  } else {
    console.log(`[QRIS Webhook] Ignored non-success webhook. Status: ${statusStr}`);
  }

  const entry: WebhookLogEntry = {
    id: `WH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    source: req.ip || req.socket.remoteAddress || 'unknown',
    headers: req.headers as Record<string, string | string[] | undefined>,
    payload: req.body,
    status: isSuccess ? 'PROCESSED' : 'RECEIVED'
  };

  webhookLogs.unshift(entry);
  if (webhookLogs.length > 50) webhookLogs.pop();

  console.log("[QRIS Webhook Received]:", JSON.stringify({ entry, recordedPayment: record }, null, 2));

  res.status(200).json({
    success: true,
    received: true,
    status: "PROCESSED",
    isPaid: isSuccess,
    invoiceId: record?.invoiceId || payload.invoice_id || payload.invoiceId,
    transactionId: record?.transactionId || payload.transaction_id || payload.transactionId,
    logId: entry.id,
    timestamp: entry.timestamp,
    message: isSuccess ? "Pembayaran berhasil diproses dan dicatat." : "Webhook event received and logged."
  });
});

// 2.1 Endpoint: GET /api/qris/payment-status/:invoiceId (Poll payment status for public invoice)
app.get("/api/qris/payment-status/:invoiceId", async (req, res) => {
  const { invoiceId } = req.params;
  const txId = (req.query.txId || req.query.transactionId || '') as string;
  const targetAmount = Number(req.query.amount || 0);

  let record = paidTransactions.get(invoiceId) || 
               paidTransactions.get(normalizeKey(invoiceId)) || 
               (txId ? paidTransactions.get(txId) || paidTransactions.get(normalizeKey(txId)) : null);

  // If not found in map, inspect recent webhook logs as fallback
  if (!record && webhookLogs.length > 0) {
    for (const log of webhookLogs) {
      const p = log.payload || {};
      const data = p.data || p.result || p.transaction || {};
      const logInvId = String(p.invoice_id || p.invoiceId || p.order_id || p.orderId || p.ref_id || p.id || '');
      const logTxId = String(p.transaction_id || p.transactionId || p.trx_id || p.id || data.id || '');
      const logStatus = String(p.status || p.payment_status || p.transaction_status || p.event || '').toUpperCase();
      const logAmount = Number(p.amount || p.nominal || p.total || 0);

      const isLogPaid = logStatus.includes('PAID') || 
                        logStatus.includes('SUCCESS') || 
                        logStatus.includes('SETTLED') || 
                        logStatus.includes('COMPLETED') ||
                        logStatus.includes('00') ||
                        logStatus === '0' ||
                        p.event === 'payment.success';

      if (isLogPaid) {
        const matchesInvoice = logInvId && (logInvId === invoiceId || normalizeKey(logInvId) === normalizeKey(invoiceId));
        const matchesTx = txId && logTxId && (logTxId === txId || normalizeKey(logTxId) === normalizeKey(txId));
        const matchesAmount = targetAmount > 0 && logAmount === targetAmount;

        if (matchesInvoice || matchesTx || (matchesAmount && (matchesInvoice || !logInvId))) {
          record = recordPaymentSuccess(p, invoiceId, txId || logTxId, targetAmount || logAmount);
          break;
        }
      }
    }
  }

  if (record) {
    // FORCE UPDATE TO FIRESTORE DIRECTLY
    try {
      if (adminDb) {
        await adminDb.collection('invoices').doc(invoiceId).update({
          status: 'paid',
          paidAt: record.paidAt || new Date().toISOString(),
          paymentMethod: record.paymentSource || 'QRIS Dinamis'
        });
        console.log(`[QRIS Poll] Recovered & forcefully updated Firestore for Invoice #${invoiceId}`);
      }
    } catch (e: any) {
      console.warn(`[QRIS Poll] Could not sync to Firestore (might already be paid): ${e.message}`);
    }

    return res.json({
      success: true,
      isPaid: true,
      status: 'PAID',
      payment: {
        invoiceId: invoiceId,
        transactionId: record.transactionId || txId || `TX-${invoiceId}`,
        amount: record.amount,
        paidAt: record.paidAt,
        paymentSource: record.paymentSource || 'QRIS Dinamis',
        status: record.status
      }
    });
  }

  return res.json({
    success: true,
    isPaid: false,
    status: 'PENDING',
    invoiceId,
    message: 'Menunggu konfirmasi pembayaran dari gateway QRIS.'
  });
});

// 2.2 Endpoint: POST /api/qris/mark-paid (Manually mark invoice as paid or trigger test)
app.post("/api/qris/mark-paid", (req, res) => {
  const { invoiceId, transactionId, amount, paymentSource } = req.body;
  if (!invoiceId) {
    return res.status(400).json({ success: false, error: "Field 'invoiceId' is required." });
  }

  const record = recordPaymentSuccess(
    { provider: paymentSource || 'QRIS Dinamis', amount: Number(amount || 0) },
    String(invoiceId),
    String(transactionId || `TX-${invoiceId}`),
    Number(amount || 0)
  );

  return res.json({
    success: true,
    isPaid: true,
    message: `Invoice #${invoiceId} berhasil ditandai sebagai LUNAS.`,
    payment: record
  });
});

// 3. Endpoint: GET /api/qris/webhook-logs
app.get("/api/qris/webhook-logs", (req, res) => {
  res.json({
    success: true,
    count: webhookLogs.length,
    logs: webhookLogs
  });
});

// 4. Endpoint: DELETE /api/qris/webhook-logs
app.delete("/api/qris/webhook-logs", (req, res) => {
  webhookLogs.length = 0;
  res.json({ success: true, message: "Webhook logs cleared." });
});

// 5. Endpoint: POST /api/qris/simulate-webhook (Allows sending custom webhook tests)
app.post("/api/qris/simulate-webhook", async (req, res) => {
  const { targetUrl, payload, secretApiKey } = req.body;
  const defaultTarget = `http://localhost:${Number(process.env.PORT) || 3000}/api/qris/payment-callback`;
  const url = targetUrl || defaultTarget;

  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secretApiKey ? { "X-API-Key": secretApiKey } : {})
      },
      body: JSON.stringify(payload)
    });

    const latency = Date.now() - startTime;
    const responseText = await response.text();
    let responseJson = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      // Keep as text
    }

    res.json({
      success: response.ok,
      httpStatus: response.status,
      statusText: response.statusText,
      latencyMs: latency,
      targetUrl: url,
      response: responseJson || responseText
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to simulate webhook request";
    res.status(500).json({
      success: false,
      error: message,
      targetUrl: url
    });
  }
});

// API Route for sending email
app.post("/api/send-invoice-email", async (req, res) => {
  const { email, clientName, invoiceType, invoiceId, publicUrl, appName } = req.body;
  console.log(`Attempting to send email to: ${email} for invoice: ${invoiceId}`);
  
  try {
    const resend = getResendClient();
    const storeName = appName || 'JasaPro';
    const docType = invoiceType === 'invoice' ? 'Invoice' : 'Penawaran';
    
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || `${storeName} <onboarding@resend.dev>`,
      to: [email],
      subject: `[OFFICIAL] ${docType} #${invoiceId.slice(0, 8).toUpperCase()} - ${storeName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <p style="color: #171717; font-size: 16px;">Halo ${clientName},</p>
          <p style="color: #404040; line-height: 1.6;">Terima kasih telah menggunakan layanan <strong>${storeName}</strong>.</p>
          <p style="color: #404040; line-height: 1.6;">Berikut adalah ${docType} resmi Anda yang dapat diakses, diunduh, dan dicetak melalui tautan digital di bawah ini:</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${publicUrl}" style="background-color: #171717; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Lihat Dokumen Digital</a>
          </div>
          <p style="color: #737373; font-size: 14px;">Jika ada pertanyaan, silakan hubungi kami.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #a3a3a3; font-size: 12px;">Hormat kami,<br>Tim ${storeName}</p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend API Error:", JSON.stringify(error, null, 2));
      return res.status(400).json({ 
        error: "Resend API Error", 
        details: error,
        message: error.message 
      });
    }

    console.log("Email sent successfully via Resend:", data?.id);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Unexpected Server Error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: errorMessage });
  }
});

// Vite middleware for development or static serving for production
async function setupVite() {
  // On Vercel, we don't need to setup Vite or serve static files from Express
  // Vercel handles static serving and routing via vercel.json
  if (process.env.VERCEL) return;

  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Vite could not be initialized:", e);
    }
  } else {
    // In production (non-Vercel), we serve static files from /dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Only start the server if we're not running as a serverless function
if (!process.env.VERCEL) {
  setupVite().then(() => {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}

export default app;
