/**
 * Brevo (formerly Sendinblue) Transactional Email Service
 * Uses Brevo's Official Free Plan API (300 free emails/day)
 */

export interface SendBrevoConfirmationOptions {
  toEmail: string;
  toName: string;
  phone?: string;
  verificationCode?: string;
}

export interface BrevoEmailResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  code?: string;
  error?: string;
}

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

import { brevoCircuitBreaker, withRetry } from './resilience';

export async function sendBrevoConfirmationEmail(
  options: SendBrevoConfirmationOptions
): Promise<BrevoEmailResult> {
  const { toEmail, toName, phone = '', verificationCode } = options;

  // Generate a friendly 6-digit confirmation code if not provided
  const code = verificationCode || Math.floor(100000 + Math.random() * 900000).toString();

  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'welcome@sethsawariya.com').trim();
  const senderName = (process.env.BREVO_SENDER_NAME || 'Seth Sawariya Cafe & Roastery').trim();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to Seth Sawariya Cafe</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F9F5EE; color: #1E140F; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #E6DCCD; overflow: hidden; box-shadow: 0 4px 20px rgba(30, 20, 15, 0.06); }
    .header { background-color: #1E140F; padding: 32px 24px; text-align: center; color: #ffffff; }
    .brand-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: #C59B67; margin-bottom: 6px; }
    .brand-title { font-size: 26px; font-weight: 800; letter-spacing: 2px; color: #FFFFFF; margin: 0; }
    .brand-sub { font-size: 13px; font-style: italic; color: #C59B67; margin-top: 4px; }
    .body-content { padding: 32px 28px; }
    .greeting { font-size: 18px; font-weight: 700; color: #1E140F; margin-bottom: 12px; }
    .text { font-size: 14px; line-height: 1.6; color: #4A3224; margin-bottom: 20px; }
    .code-box { background: #F9F5EE; border: 1.5px dashed #C59B67; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .code-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #8A6538; margin-bottom: 6px; font-weight: 600; }
    .code-digits { font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #FF6422; font-family: monospace; }
    .details-table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
    .details-table td { padding: 8px 0; border-bottom: 1px solid #F0E9DF; color: #4A3224; }
    .details-table td.label { font-weight: 600; color: #1E140F; width: 35%; }
    .perks-badge { background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 12px; margin-top: 20px; font-size: 13px; color: #065F46; }
    .footer { background: #FAF7F2; padding: 20px; text-align: center; font-size: 11px; color: #8A7A70; border-top: 1px solid #EFEAE2; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand-eyebrow">Handcrafted Brews &amp; Heritage</div>
      <h1 class="brand-title">SETH SAWARIYA</h1>
      <div class="brand-sub">— Cafe &amp; Roastery —</div>
    </div>
    
    <div class="body-content">
      <div class="greeting">Namaste ${escapeHtml(toName)},</div>
      <p class="text">
        Aapka <strong>Seth Sawariya Cafe</strong> family mein hardik swagat hai! Aapka customer account successfully create ho chuka hai.
      </p>

      <div class="code-box">
        <div class="code-label">Aapka One-Time Verification / Welcome Code</div>
        <div class="code-digits">${code}</div>
      </div>

      <p class="text">
        Neeche diye gaye details se aapka account register kiya gaya hai:
      </p>

      <table class="details-table">
        <tr>
          <td class="label">Customer Name:</td>
          <td><strong>${escapeHtml(toName)}</strong></td>
        </tr>
        <tr>
          <td class="label">Email Address:</td>
          <td>${escapeHtml(toEmail)}</td>
        </tr>
        ${
          phone
            ? `<tr>
          <td class="label">Mobile Number:</td>
          <td>${escapeHtml(phone)}</td>
        </tr>`
            : ''
        }
        <tr>
          <td class="label">Service Provider:</td>
          <td>Supabase Auth + Brevo Transactional Service</td>
        </tr>
      </table>

      <div class="perks-badge">
        Earn 25 Beans by rating a served order. Redeem 2 Beans for ₹1 off a future order.
      </div>
    </div>

    <div class="footer">
      Seth Sawariya Cafe &amp; Roastery · Powered by Brevo Free Plan Transactional Engine<br/>
      Agar aapne yeh account create nahi kiya hai toh kripya is email ko ignore karein.
    </div>
  </div>
</body>
</html>
  `.trim();

  // If live Brevo API key is available, send real email via Brevo REST API protected by Circuit Breaker
  if (apiKey && apiKey !== 'YOUR_BREVO_API_KEY') {
    try {
      return await brevoCircuitBreaker.execute(async () => {
        const response = await withRetry(
          () =>
            fetch(BREVO_API_URL, {
              method: 'POST',
              headers: {
                'api-key': apiKey,
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({
                sender: {
                  name: senderName,
                  email: senderEmail,
                },
                to: [
                  {
                    email: toEmail,
                    name: toName,
                  },
                ],
                subject: 'Welcome to Seth Sawariya Cafe — Account Confirmation',
                htmlContent,
              }),
            }),
          { maxRetries: 2, initialDelayMs: 300 }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const errorMsg = (data as { message?: string }).message || `Brevo API HTTP ${response.status}`;
          console.error('[Brevo Error]', errorMsg);
          return {
            success: false,
            error: errorMsg,
            code,
          };
        }

        const messageId = (data as { messageId?: string }).messageId;
        console.log(`[Brevo] Email sent to ${toEmail} (Message ID: ${messageId})`);
        return {
          success: true,
          messageId,
          code,
          simulated: false,
        };
      });
    } catch (err) {
      console.error('[Brevo Network Error / Circuit Open]', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Brevo network error',
        code,
      };
    }
  }

  // Graceful simulated mode when BREVO_API_KEY is not yet provided in .env
  console.log(
    `[Brevo Service (Simulated)] Confirmation email queued for ${toEmail} (${toName}). Verification code: ${code}`
  );

  return {
    success: true,
    simulated: true,
    code,
    messageId: `sim_${Date.now()}`,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
