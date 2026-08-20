import express from "express";
import path from "path";
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

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

// 0. Proxy Endpoint: POST /api/qris/proxy-generate (Bypasses CORS for external API URLs)
app.post("/api/qris/proxy-generate", async (req, res) => {
  const { apiEndpoint, secretApiKey, payload } = req.body;
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

    // Comprehensive normalization for various Indonesian QRIS API providers (QRISAN, Qrisku, Midtrans, Xendit, Tripay, etc.)
    let extractedQrisContent = '';
    let extractedQrImage = '';
    let extractedTxId = '';
    let extractedExpiresAt = '';
    let extractedMerchant = targetMerchant;

    if (responseData && typeof responseData === 'object') {
      const d = responseData.data || responseData.result || responseData;
      
      extractedQrisContent = d.qrisContent || 
                             d.qris_content || 
                             d.qr_string || 
                             d.qrString || 
                             d.qr_code || 
                             d.qrCode || 
                             d.qris_data || 
                             d.raw_qr || 
                             d.qris || 
                             d.qr || 
                             responseData.qrisContent ||
                             responseData.qris_content ||
                             responseData.qr_string ||
                             responseData.qrString ||
                             responseData.qr_code ||
                             responseData.qrCode ||
                             '';

      extractedQrImage = d.qr_image || 
                         d.qr_image_url || 
                         d.qr_url || 
                         d.qrImageUrl || 
                         d.qrUrl || 
                         d.image || 
                         d.qr_image_base64 || 
                         responseData.qr_image ||
                         responseData.qr_image_url ||
                         responseData.qr_url ||
                         '';

      extractedTxId = d.transaction_id || 
                      d.transactionId || 
                      d.id || 
                      d.tx_id || 
                      d.reference_id || 
                      d.ref_id || 
                      d.order_id || 
                      responseData.transaction_id ||
                      responseData.transactionId ||
                      responseData.id ||
                      `TX-${Date.now()}`;

      extractedExpiresAt = d.expires_at || 
                           d.expired_at || 
                           d.expiresAt || 
                           d.expiredAt || 
                           d.expiry_time || 
                           responseData.expires_at || 
                           responseData.expired_at || 
                           new Date(Date.now() + 30 * 60 * 1000).toISOString();

      if (d.merchant_name || d.merchantName) {
        extractedMerchant = d.merchant_name || d.merchantName;
      }
    }

    // Fallback standard EMVCo QR string if string wasn't explicitly returned but response is successful
    if (!extractedQrisContent && !extractedQrImage && externalResponse.ok) {
      extractedQrisContent = generateEMVCoQRIS({
        merchantName: targetMerchant,
        nmid: targetNmid,
        invoiceId: invoiceNumber,
        amount: numericAmount
      });
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
      amount: numericAmount,
      expiresAt: extractedExpiresAt,
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

// 2. Endpoint: POST /api/qris/webhook (Receives gateway callbacks)
app.post("/api/qris/webhook", (req, res) => {
  const entry: WebhookLogEntry = {
    id: `WH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    source: req.ip || req.socket.remoteAddress || 'unknown',
    headers: req.headers as Record<string, string | string[] | undefined>,
    payload: req.body,
    status: 'PROCESSED'
  };

  webhookLogs.unshift(entry);
  if (webhookLogs.length > 50) webhookLogs.pop();

  console.log("[QRIS Webhook Received]:", JSON.stringify(entry, null, 2));

  res.status(200).json({
    success: true,
    received: true,
    status: "PROCESSED",
    logId: entry.id,
    timestamp: entry.timestamp,
    message: "Webhook event received and logged successfully."
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
  const defaultTarget = `http://localhost:${Number(process.env.PORT) || 3000}/api/qris/webhook`;
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
