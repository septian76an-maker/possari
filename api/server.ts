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
