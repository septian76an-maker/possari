import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

// Lazy initialization for Resend to prevent startup issues if key is missing
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for sending email
  app.post("/api/send-invoice-email", async (req, res) => {
    const { email, clientName, invoiceType, invoiceId, publicUrl, appName } = req.body;

    try {
      const resend = getResendClient();
      const storeName = appName || 'JasaPro';
      const docType = invoiceType === 'invoice' ? 'Invoice' : 'Penawaran';

      const { data, error } = await resend.emails.send({
        from: `${storeName} <onboarding@resend.dev>`, // Default Resend test domain
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
        console.error("Resend Error:", error);
        return res.status(400).json({ error });
      }

      res.json({ success: true, data });
    } catch (err) {
      console.error("Server Error:", err);
      const errorMessage = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
