import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load environment variables
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

if (app.isPackaged) {
  // In production, look for .env next to the executable
  const exeDir = path.dirname(process.execPath);
  const envPath = path.join(exeDir, '.env');
  
  // Log the path to help debugging (you can see this if you run from cmd)
  console.log('Searching for .env at:', envPath);
  
  dotenv.config({ path: envPath });
  
  // Double check if key is loaded
  if (process.env.RESEND_API_KEY) {
    console.log('RESEND_API_KEY loaded successfully from .env');
  } else {
    console.warn('RESEND_API_KEY NOT FOUND in .env at', envPath);
  }
} else {
  dotenv.config();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  console.log(`Electron starting. isDev: ${isDev}, NODE_ENV: ${process.env.NODE_ENV}`);

  // Resolve preload path more robustly
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Preload path:', preloadPath);
  
  if (!fs.existsSync(preloadPath)) {
    console.error('CRITICAL: Preload script not found at:', preloadPath);
  }

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Sometimes needed for complex preloads
      webSecurity: !isDev,
    },
    title: "Sistem Invoice",
  });

  // In development, load from the dev server
  if (isDev) {
    console.log('Loading development URL: http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000').catch((err) => {
      console.error('Failed to load URL:', err);
    });
    mainWindow.webContents.openDevTools();
    
    // Add listener for load failures
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error(`Failed to load: ${validatedURL} (${errorCode}: ${errorDescription})`);
      if (errorCode === -105 || errorCode === -102) { // Connection refused or server not ready
        setTimeout(() => {
          mainWindow.loadURL('http://localhost:3000');
        }, 2000);
      }
    });
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch((err) => {
      console.error('Failed to load file:', err);
    });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- PRINTER LOGIC PLACEHOLDER ---
// You can use libraries like 'escpos' here to talk to hardware
ipcMain.handle('print-invoice', async (event, data) => {
  console.log('Printing invoice:', data);
  return { success: true };
});

// --- EMAIL LOGIC ---
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

ipcMain.handle('send-email', async (event, payload) => {
  const { email, clientName, invoiceType, invoiceId, publicUrl, appName } = payload;
  console.log(`Electron attempting to send email to: ${email} for invoice: ${invoiceId}`);
  
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      return { 
        success: false, 
        error: "RESEND_API_KEY tidak ditemukan di file .env. Pastikan file .env ada di samping file .exe Anda." 
      };
    }
    
    const resend = getResendClient();
    const storeName = appName || 'JasaPro';
    const docType = invoiceType === 'invoice' ? 'Invoice' : 'Penawaran';
    
    console.log(`Using publicUrl: ${publicUrl}`);
    if (publicUrl.startsWith('file://')) {
      return {
        success: false,
        error: "URL Publik tidak valid (file://). Pastikan VITE_WEB_URL sudah disetel saat build."
      };
    }
    
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
      console.error("Resend API Error (Electron):", JSON.stringify(error, null, 2));
      return { success: false, error: error.message || "Resend API Error" };
    }

    console.log("Email sent successfully via Electron:", data?.id);
    return { success: true, data };
  } catch (err: any) {
    console.error("Unexpected Electron Error:", err);
    return { success: false, error: err.message || "Internal error" };
  }
});
