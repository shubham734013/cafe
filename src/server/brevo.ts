/**
 * Brevo (formerly Sendinblue) Transactional Email Service
 * Uses Brevo's Official Free Plan API (300 free emails/day)
 */

export interface SendBrevoConfirmationOptions {
  toEmail: string;
  toName: string;
  phone?: string;
  verificationCode?: string;
  isWelcome?: boolean;
  appUrl?: string;
}

export interface BrevoEmailResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

import { brevoCircuitBreaker, withRetry } from './resilience';
import type { CafeOrder, CafeSettings } from '../types/cafe';

export function isBrevoConfigured(): boolean {
  return (
    process.env.NODE_ENV !== 'test' &&
    Boolean(
      process.env.BREVO_API_KEY?.trim() &&
        process.env.BREVO_API_KEY !== 'YOUR_BREVO_API_KEY' &&
        process.env.BREVO_SENDER_EMAIL?.trim()
    )
  );
}

export async function sendBrevoConfirmationEmail(
  options: SendBrevoConfirmationOptions
): Promise<BrevoEmailResult> {
  const {
    toEmail,
    toName,
    phone = '',
    verificationCode,
    isWelcome = false,
    appUrl = process.env.APP_URL || 'http://localhost:3002',
  } = options;

  // Only render an OTP verification box if an explicit verification code is provided
  // Customer creation / onboarding emails must NEVER include an OTP!
  const hasExplicitCode = Boolean(
    !isWelcome &&
      verificationCode &&
      verificationCode.trim() !== '' &&
      verificationCode.trim() !== 'NOTICE' &&
      verificationCode.trim() !== 'WELCOME'
  );

  const code = hasExplicitCode ? verificationCode!.trim() : (verificationCode?.trim() || 'MEMBER');
  const isOtp = hasExplicitCode;

  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'welcome@sethsawariya.com').trim();
  const senderName = (process.env.BREVO_SENDER_NAME || 'Seth Sawariya Cafe & Roastery').trim();

  const emailSubject = isOtp
    ? 'Your Verification Code — Seth Sawariya Cafe'
    : 'Welcome to Seth Sawariya Cafe & Roastery! ☕';

  const htmlContent = isOtp
    ? `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verification Code — Seth Sawariya Cafe</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F5F0; color: #1B110B; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #E6DCCD; overflow: hidden; box-shadow: 0 4px 20px rgba(30, 20, 15, 0.06); }
    .header { background-color: #1B110B; padding: 32px 24px; text-align: center; color: #ffffff; }
    .brand-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: #C59B67; margin-bottom: 6px; }
    .brand-title { font-size: 26px; font-weight: 800; letter-spacing: 2px; color: #FFFFFF; margin: 0; }
    .brand-sub { font-size: 13px; font-style: italic; color: #C59B67; margin-top: 4px; }
    .body-content { padding: 32px 28px; }
    .greeting { font-size: 18px; font-weight: 700; color: #1B110B; margin-bottom: 12px; }
    .text { font-size: 14px; line-height: 1.6; color: #4A3224; margin-bottom: 20px; }
    .code-box { background: #F8F5F0; border: 1.5px dashed #C59B67; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .code-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #8A6538; margin-bottom: 6px; font-weight: 600; }
    .code-digits { font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #FF6422; font-family: monospace; }
    .footer { background: #FAF7F2; padding: 20px; text-align: center; font-size: 11px; color: #8A7A70; border-top: 1px solid #EFEAE2; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header" style="text-align: center;">
      <img src="https://ctrl-dpi-ears-wall.trycloudflare.com/images/tsc-logo.jpg" alt="The Sawariya Cafe Logo" width="68" height="68" style="border-radius: 50%; border: 2px solid #C59B67; margin-bottom: 10px; display: inline-block;" />
      <div class="brand-eyebrow">Good Food • Good Mood</div>
      <h1 class="brand-title">THE SAWARIYA CAFE</h1>
      <div class="brand-sub">— Cafe &amp; Fast Food —</div>
    </div>

    <div class="body-content">
      <div class="greeting">Namaste ${escapeHtml(toName)},</div>
      <p class="text">
        Neeche diye gaye verification code se apna verification complete karein:
      </p>

      <div class="code-box">
        <div class="code-label">Aapka One-Time Verification Code</div>
        <div class="code-digits">${code}</div>
      </div>

      <p class="text" style="font-size: 12px; color: #8A7A70;">
        Yeh code agle 5 minutes ke liye valid hai. Kripya is code ko kisi ke sath share na karein.
      </p>
    </div>

    <div class="footer">
      Seth Sawariya Cafe &amp; Roastery · Powered by Brevo Transactional Engine
    </div>
  </div>
</body>
</html>
    `.trim()
    : `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to Seth Sawariya Cafe &amp; Roastery</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F5F0; color: #1B110B; margin: 0; padding: 24px 12px; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #EAE3D9; overflow: hidden; box-shadow: 0 10px 30px rgba(27, 17, 11, 0.08); }
    .header { background: #1B110B; padding: 36px 24px; text-align: center; color: #ffffff; position: relative; }
    .gold-arch { width: 56px; height: 56px; margin: 0 auto 12px auto; display: block; }
    .brand-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: #C59B67; margin-bottom: 6px; font-weight: 700; }
    .brand-title { font-size: 26px; font-weight: 900; letter-spacing: 2px; color: #FFFFFF; margin: 0; }
    .brand-sub { font-size: 13px; font-style: italic; color: #C59B67; margin-top: 4px; }
    .body-content { padding: 32px 28px; }
    .welcome-card { background: linear-gradient(135deg, #2D1A10 0%, #1B110B 100%); border-radius: 14px; padding: 24px; text-align: center; color: #ffffff; margin-bottom: 24px; border: 1px solid #4A3023; }
    .welcome-badge { display: inline-block; background: rgba(197, 155, 103, 0.2); border: 1px solid #C59B67; color: #C59B67; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; padding: 4px 12px; border-radius: 9999px; margin-bottom: 10px; }
    .welcome-title { font-size: 22px; font-weight: 800; color: #FFFFFF; margin: 0 0 8px 0; letter-spacing: 0.5px; }
    .welcome-desc { font-size: 13.5px; color: #D6C2B4; line-height: 1.6; margin: 0; }
    .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; background: #FAF7F2; border-radius: 12px; border: 1px solid #EFEAE2; overflow: hidden; }
    .details-table td { padding: 12px 16px; border-bottom: 1px solid #EFEAE2; color: #4A3224; }
    .details-table tr:last-child td { border-bottom: none; }
    .details-table td.label { font-weight: 600; color: #1B110B; width: 38%; }
    .perks-box { background: #ECFDF5; border: 1.5px solid #A7F3D0; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .perks-header { font-size: 13px; font-weight: 800; color: #065F46; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .perks-list { margin: 0; padding-left: 20px; color: #047857; font-size: 13px; line-height: 1.7; }
    .cta-button { display: inline-block; background: #C59B67; color: #1B110B; font-weight: 800; font-size: 14px; text-decoration: none; padding: 14px 34px; border-radius: 9999px; letter-spacing: 0.5px; box-shadow: 0 4px 14px rgba(197, 155, 103, 0.35); text-align: center; }
    .footer { background: #F8F5F0; padding: 24px; text-align: center; font-size: 11px; color: #8A7A70; border-top: 1px solid #EFEAE2; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://ctrl-dpi-ears-wall.trycloudflare.com/images/tsc-logo.jpg" alt="The Sawariya Cafe Logo" width="68" height="68" style="border-radius: 50%; border: 2px solid #C59B67; margin-bottom: 10px; display: inline-block;" />
      <div class="brand-eyebrow">Good Food • Good Mood</div>
      <h1 class="brand-title">THE SAWARIYA CAFE</h1>
      <div class="brand-sub">— Cafe &amp; Fast Food —</div>
    </div>

    <div class="body-content">
      <div class="welcome-card">
        <div class="welcome-badge">Roastery Club Member</div>
        <h2 class="welcome-title">Namaste ${escapeHtml(toName)}!</h2>
        <p class="welcome-desc">
          Aapka <strong>Seth Sawariya Cafe &amp; Roastery</strong> family mein hardik swagat hai! Aapka customer account successfully activate ho chuka hai.
        </p>
      </div>

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
          <td class="label">Membership Status:</td>
          <td><strong style="color: #065F46;">Active Privileged Member</strong></td>
        </tr>
      </table>

      <div class="perks-box">
        <div class="perks-header">✦ Aapke Exclusive Member Benefits</div>
        <ul class="perks-list">
          <li><strong>Roastery Beans Loyalty:</strong> Har served order par review dekar <strong>25 Beans</strong> earn karein.</li>
          <li><strong>Instant Checkout Redemption:</strong> 2 Beans = ₹1 flat discount agle bills par redeem karein.</li>
          <li><strong>Digital Tax Invoices:</strong> Har successful payment par itemized bill direct aapke email par.</li>
          <li><strong>Live Kitchen Tracking:</strong> Real-time KOT status apne mobile par live monitor karein.</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 30px 0 12px 0;">
        <a href="${appUrl}/customer/menu" class="cta-button">
          Browse Menu &amp; Order Online &rarr;
        </a>
      </div>
    </div>

    <div class="footer">
      Seth Sawariya Cafe &amp; Roastery · Powered by Brevo Transactional Engine<br/>
      Agar aapne yeh account create nahi kiya hai toh kripya is email ko ignore karein.<br/>
      Shop No. 4, Heritage Market, Station Road · GSTIN: 08AABCS1429B1Z8
    </div>
  </div>
</body>
</html>
    `.trim();

  if (!isBrevoConfigured()) {
    return { success: false, simulated: false, error: 'Email delivery is not configured.' };
  }

  if (apiKey) {
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
                subject: emailSubject,
                htmlContent,
              }),
            }),
          { maxRetries: 2, initialDelayMs: 300 }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          console.error('[Brevo] Provider rejected a transactional email request.');
          return { success: false, error: 'Email delivery failed.' };
        }

        const messageId = (data as { messageId?: string }).messageId;
        console.info('[Brevo] Transactional email delivered.');
        return {
          success: true,
          messageId,
          simulated: false,
        };
      });
    } catch {
      console.error('[Brevo] Transactional email delivery failed.');
      return {
        success: false,
        error: 'Email delivery failed.',
      };
    }
  }

  return { success: false, simulated: false, error: 'Email delivery is not configured.' };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface SendBrevoBroadcastOptions {
  recipients: Array<{ email: string; name: string }>;
  subject: string;
  heading: string;
  message: string;
  promoCode?: string;
  discountBadge?: string;
}

export interface BrevoBroadcastResult {
  success: boolean;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  simulated?: boolean;
  messageIds?: string[];
  error?: string;
}

export async function broadcastBrevoMarketingEmail(
  options: SendBrevoBroadcastOptions
): Promise<BrevoBroadcastResult> {
  const { recipients, subject, heading, message, promoCode, discountBadge } = options;
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'welcome@sethsawariya.com').trim();
  const senderName = (process.env.BREVO_SENDER_NAME || 'Seth Sawariya Cafe & Roastery').trim();

  if (!recipients || recipients.length === 0) {
    return {
      success: true,
      totalRecipients: 0,
      sentCount: 0,
      failedCount: 0,
    };
  }

  if (!isBrevoConfigured()) {
    return {
      success: false,
      totalRecipients: recipients.length,
      sentCount: 0,
      failedCount: recipients.length,
      simulated: false,
      error: 'Email delivery is not configured.',
    };
  }

  const buildHtml = (recipientName: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F9F5EE; color: #1E140F; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #E6DCCD; overflow: hidden; box-shadow: 0 4px 20px rgba(30, 20, 15, 0.06); }
    .header { background-color: #1E140F; padding: 32px 24px; text-align: center; color: #ffffff; }
    .brand-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: #C59B67; margin-bottom: 6px; }
    .brand-title { font-size: 26px; font-weight: 800; letter-spacing: 2px; color: #FFFFFF; margin: 0; }
    .brand-sub { font-size: 13px; font-style: italic; color: #C59B67; margin-top: 4px; }
    .body-content { padding: 32px 28px; }
    .heading { font-size: 22px; font-weight: 800; color: #1E140F; margin-bottom: 14px; }
    .greeting { font-size: 16px; font-weight: 600; color: #4A3224; margin-bottom: 12px; }
    .text { font-size: 14px; line-height: 1.6; color: #4A3224; margin-bottom: 20px; white-space: pre-line; }
    .offer-box { background: #FFF7ED; border: 2px dashed #EA580C; border-radius: 14px; padding: 20px; text-align: center; margin: 24px 0; }
    .offer-badge { display: inline-block; background: #EA580C; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; padding: 4px 12px; border-radius: 20px; margin-bottom: 8px; }
    .promo-code { font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #9A3412; font-family: monospace; }
    .promo-note { font-size: 12px; color: #7C2D12; margin-top: 6px; }
    .footer { background: #FAF7F2; padding: 20px; text-align: center; font-size: 11px; color: #8A7A70; border-top: 1px solid #EFEAE2; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand-eyebrow">Seth Sawariya Special Broadcast</div>
      <h1 class="brand-title">SETH SAWARIYA</h1>
      <div class="brand-sub">— Cafe &amp; Roastery —</div>
    </div>

    <div class="body-content">
      <h2 class="heading">${escapeHtml(heading)}</h2>
      <div class="greeting">Namaste ${escapeHtml(recipientName)},</div>
      <p class="text">${escapeHtml(message)}</p>

      ${
        promoCode
          ? `
      <div class="offer-box">
        ${discountBadge ? `<div class="offer-badge">${escapeHtml(discountBadge)}</div>` : ''}
        <div style="font-size: 11px; color: #C2410C; font-weight: 600; text-transform: uppercase; margin-bottom: 4px;">Exclusive Promo Code</div>
        <div class="promo-code">${escapeHtml(promoCode)}</div>
        <div class="promo-note">Apply at checkout on dine-in QR menu or counter POS.</div>
      </div>
      `
          : ''
      }
    </div>

    <div class="footer">
      Seth Sawariya Cafe &amp; Roastery · Powered by Brevo Email Broadcast Engine<br/>
      Exclusive privileges for our cafe patrons.
    </div>
  </div>
</body>
</html>
  `.trim();

  // If live Brevo API key is available, send via Brevo
  if (apiKey && apiKey !== 'YOUR_BREVO_API_KEY') {
    const messageIds: string[] = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
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
                    email: recipient.email,
                    name: recipient.name || 'Valued Customer',
                  },
                ],
                subject,
                htmlContent: buildHtml(recipient.name || 'Valued Customer'),
              }),
            }),
          { maxRetries: 2, initialDelayMs: 200 }
        );

        if (response.ok) {
          const resData = (await response.json().catch(() => ({}))) as { messageId?: string };
          if (resData.messageId) messageIds.push(resData.messageId);
          sentCount++;
        } else {
          failedCount++;
        }
      } catch {
        console.error('[Brevo] Marketing email delivery failed.');
        failedCount++;
      }
    }

    return {
      success: sentCount > 0,
      totalRecipients: recipients.length,
      sentCount,
      failedCount,
      simulated: false,
      messageIds,
    };
  }

  return {
    success: false,
    totalRecipients: recipients.length,
    sentCount: 0,
    failedCount: recipients.length,
    simulated: false,
    error: 'Email delivery is not configured.',
  };
}

export interface SendBrevoOrderBillOptions {
  order: CafeOrder;
  toEmail: string;
  toName?: string;
  cafeSettings?: Partial<CafeSettings>;
  appUrl?: string;
}

export type SendBrevoOrderPaidOptions = SendBrevoOrderBillOptions;

/**
 * Send custom-designed official Order Paid Confirmation & GST Tax Invoice to Customer via Brevo Email
 */
export async function sendBrevoOrderPaidEmail(
  options: SendBrevoOrderPaidOptions
): Promise<BrevoEmailResult> {
  const { order, toEmail, toName, cafeSettings } = options;
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'billing@sethsawariya.com').trim();
  const senderName = (process.env.BREVO_SENDER_NAME || 'Seth Sawariya Cafe & Roastery').trim();
  const appUrl = (options.appUrl || process.env.APP_URL || 'http://localhost:3002').trim().replace(/\/+$/, '');
  const trackingUrl = `${appUrl}/customer/tracking?orderId=${encodeURIComponent(order.id)}`;

  const recipientName = toName || order.customerName || 'Valued Guest';
  const cafeName = cafeSettings?.cafeName || 'Seth Sawariya Cafe & Roastery';
  const address = cafeSettings?.address || '12 Civil Lines, Near Clock Tower, Jaipur, RJ 302001';
  const phone = cafeSettings?.phone || '+91 98765 43210';
  const gstin = cafeSettings?.gstin || '08AABCS1429B1ZB';
  const fssai = '10021011000123';

  const orderDate = new Date(order.createdAt || Date.now()).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

  const paymentModeLabel =
    order.paymentMode === 'cash'
      ? 'Cash on Counter'
      : order.paymentMode === 'card'
      ? 'Card Settlement'
      : 'UPI Online (Cashfree / QR)';

  const itemsRows = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #F0EAE1; color: #1E140F; vertical-align: top;">
        <div style="font-weight: 700; font-size: 14px; color: #1E140F;">${escapeHtml(item.name)}</div>
        ${item.note ? `<div style="font-size: 11px; color: #8A7A70; font-style: italic; margin-top: 2px;">Note: ${escapeHtml(item.note)}</div>` : ''}
      </td>
      <td style="padding: 12px 8px; border-bottom: 1px solid #F0EAE1; text-align: center; color: #4A3224; font-size: 13px; font-weight: 600; vertical-align: top;">
        ×${item.quantity}
      </td>
      <td style="padding: 12px 8px; border-bottom: 1px solid #F0EAE1; text-align: right; color: #4A3224; font-size: 13px; vertical-align: top;">
        ₹${item.price}
      </td>
      <td style="padding: 12px 0; border-bottom: 1px solid #F0EAE1; text-align: right; font-weight: 800; color: #1E140F; font-size: 14px; vertical-align: top;">
        ₹${item.price * item.quantity}
      </td>
    </tr>
  `
    )
    .join('');

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Confirmed — Order #${escapeHtml(order.id)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #F8F5F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; }
    img { border: 0; outline: none; text-decoration: none; }
    .email-wrapper { width: 100%; background-color: #F8F5F0; padding: 28px 12px; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 20px; overflow: hidden; border: 1px solid #EADBCE; box-shadow: 0 10px 30px rgba(45, 27, 18, 0.08); }
    .header-band { background: linear-gradient(135deg, #1B110B 0%, #2A1A12 100%); padding: 32px 24px; text-align: center; border-bottom: 3px solid #C59B67; }
    .brand-eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: 3px; color: #C59B67; font-weight: 800; margin-bottom: 6px; }
    .brand-title { font-size: 26px; font-weight: 900; letter-spacing: 2px; color: #FFFFFF; margin: 0; font-family: 'Georgia', serif; }
    .brand-sub { font-size: 12px; color: #E8D5C4; margin-top: 4px; letter-spacing: 0.5px; }
    .success-hero { background-color: #F0FDF4; border-bottom: 1px solid #DCFCE7; padding: 24px; text-align: center; }
    .success-badge { display: inline-block; background-color: #16A34A; color: #FFFFFF; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; padding: 6px 16px; border-radius: 30px; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.25); }
    .hero-amount { font-size: 34px; font-weight: 900; color: #166534; margin: 4px 0 8px; letter-spacing: -0.5px; }
    .hero-greeting { font-size: 15px; color: #14532D; font-weight: 600; line-height: 1.5; margin: 0; }
    .content-body { padding: 32px 28px; }
    .meta-card { background-color: #FAF7F2; border: 1px solid #EFEAE2; border-radius: 14px; padding: 18px 20px; margin-bottom: 26px; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
    .meta-label { color: #8A7A70; font-weight: 600; }
    .meta-value { color: #1E140F; font-weight: 700; text-align: right; }
    .cta-container { text-align: center; margin: 26px 0; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #FF6422 0%, #E55518 100%); color: #FFFFFF !important; font-size: 14px; font-weight: 800; text-decoration: none; padding: 14px 32px; border-radius: 50px; box-shadow: 0 6px 20px rgba(255, 100, 34, 0.35); text-transform: uppercase; letter-spacing: 0.5px; }
    .items-table { width: 100%; margin: 20px 0 10px; font-size: 13px; }
    .items-table th { text-align: left; padding: 8px 0; border-bottom: 2px solid #EADBCE; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #8A7A70; font-weight: 800; }
    .summary-card { background-color: #FAF7F2; border-radius: 14px; padding: 16px 20px; margin-top: 18px; border: 1px solid #EFEAE2; }
    .summary-table { width: 100%; font-size: 13px; }
    .summary-table td { padding: 6px 0; color: #4A3224; }
    .grand-total-row td { border-top: 2px dashed #C59B67; padding-top: 12px; margin-top: 8px; font-size: 18px; font-weight: 900; color: #FF6422; }
    .perks-card { background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%); border: 1px solid #FDE68A; border-radius: 14px; padding: 16px; margin: 24px 0 10px; text-align: center; }
    .footer-band { background-color: #FAF7F2; padding: 24px; text-align: center; font-size: 11px; color: #8A7A70; border-top: 1px solid #EFEAE2; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">

      <!-- Brand Header -->
      <div class="header-band" style="text-align: center;">
        <img src="https://ctrl-dpi-ears-wall.trycloudflare.com/images/tsc-logo.jpg" alt="The Sawariya Cafe Logo" width="76" height="76" style="border-radius: 50%; border: 2px solid #C59B67; margin-bottom: 10px; display: inline-block;" />
        <div class="brand-eyebrow">Good Food • Good Mood</div>
        <h1 class="brand-title">${escapeHtml(cafeName)}</h1>
        <div class="brand-sub">${escapeHtml(address)} · Tel: ${escapeHtml(phone)}</div>
        <div style="font-size: 10px; color: #C59B67; margin-top: 6px; letter-spacing: 1px;">
          GSTIN: ${escapeHtml(gstin)} &nbsp;|&nbsp; FSSAI: ${escapeHtml(fssai)}
        </div>
      </div>

      <!-- Payment Success Hero -->
      <div class="success-hero">
        <span class="success-badge">✔ Payment Successful</span>
        <div class="hero-amount">₹${order.total}</div>
        <p class="hero-greeting">
          Namaste ${escapeHtml(recipientName)}, aapka payment confirm ho chuka hai!
        </p>
        <p style="font-size: 12px; color: #15803D; margin: 4px 0 0;">
          Your order has been sent to our kitchen. Savor the handcrafted flavours!
        </p>
      </div>

      <!-- Main Body -->
      <div class="content-body">

        <!-- Order Meta Card -->
        <table class="meta-card" style="width: 100%;">
          <tr>
            <td style="width: 50%; vertical-align: top; padding: 4px 0;">
              <div style="font-size: 11px; color: #8A7A70; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Order Reference</div>
              <div style="font-size: 16px; font-weight: 900; color: #FF6422; margin-top: 2px;">#${escapeHtml(order.id)}</div>
              <div style="font-size: 12px; color: #4A3224; margin-top: 4px;">KOT Token: <strong>${escapeHtml(order.kotNumber)}</strong></div>
            </td>
            <td style="width: 50%; vertical-align: top; text-align: right; padding: 4px 0;">
              <div style="font-size: 11px; color: #8A7A70; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Service Mode</div>
              <div style="font-size: 14px; font-weight: 800; color: #1E140F; margin-top: 2px;">
                ${escapeHtml(order.serviceMode.toUpperCase())} ${order.tableNumber ? `(Table ${escapeHtml(String(order.tableNumber))})` : ''}
              </div>
              <div style="font-size: 11px; color: #4A3224; margin-top: 4px;">${escapeHtml(orderDate)}</div>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding-top: 10px; border-top: 1px solid #EFEAE2; font-size: 12px; color: #4A3224;">
              <strong>Payment Method:</strong> ${escapeHtml(paymentModeLabel)}<br/>
              ${order.paymentRef ? `<strong>Ref:</strong> <span style="font-family: monospace; font-size: 11px;">${escapeHtml(order.paymentRef)}</span>` : ''}
            </td>
          </tr>
        </table>

        <!-- Live Tracking CTA Button -->
        <div class="cta-container">
          <a href="${trackingUrl}" target="_blank" class="cta-button">
            🛵 Track Your Order Live &rarr;
          </a>
        </div>

        <!-- Itemized Items Table -->
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 45%;">Item Description</th>
              <th style="width: 15%; text-align: center;">Qty</th>
              <th style="width: 20%; text-align: right;">Unit Price</th>
              <th style="width: 20%; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <!-- Summary & Tax Breakdown -->
        <div class="summary-card">
          <table class="summary-table">
            <tr>
              <td>Subtotal</td>
              <td style="text-align: right; font-weight: 600;">₹${order.subtotal}</td>
            </tr>
            ${
              order.discount > 0
                ? `
            <tr>
              <td style="color: #16A34A; font-weight: 600;">Special Discount / Promo</td>
              <td style="text-align: right; color: #16A34A; font-weight: 700;">-₹${order.discount}</td>
            </tr>
            `
                : ''
            }
            ${
              order.pointsDiscount && order.pointsDiscount > 0
                ? `
            <tr>
              <td style="color: #D97706; font-weight: 600;">Beans Redeemed (${order.pointsRedeemed || 0} pts)</td>
              <td style="text-align: right; color: #D97706; font-weight: 700;">-₹${order.pointsDiscount}</td>
            </tr>
            `
                : ''
            }
            <tr>
              <td>Taxes (CGST 2.5% + SGST 2.5%)</td>
              <td style="text-align: right; font-weight: 600;">₹${order.tax}</td>
            </tr>
            <tr class="grand-total-row">
              <td>Total Paid</td>
              <td style="text-align: right;">₹${order.total}</td>
            </tr>
          </table>
        </div>

        <!-- Loyalty Beans Card -->
        <div class="perks-card">
          <div style="font-size: 13px; font-weight: 800; color: #92400E; margin-bottom: 2px;">
            🎁 You Earned 25 Loyalty Beans on this Order!
          </div>
          <div style="font-size: 11px; color: #B45309;">
            Rate this order on your tracking screen to unlock your Beans for instant discounts on future meals.
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="footer-band">
        <strong>Seth Sawariya Cafe &amp; Roastery</strong><br/>
        This is an official computer-generated GST tax invoice and payment receipt.<br/>
        Delivered directly to ${escapeHtml(toEmail)} via Brevo Transactional Engine.<br/>
        For questions or feedback, WhatsApp us at ${escapeHtml(phone)} or email billing@sethsawariya.com.
      </div>

    </div>
  </div>
</body>
</html>
  `.trim();

  if (!isBrevoConfigured()) {
    return { success: false, simulated: false, error: 'Email delivery is not configured.' };
  }

  if (apiKey) {
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
                    name: recipientName,
                  },
                ],
                subject: `Payment Confirmed! Your Bill #${order.id} (₹${order.total}) — Seth Sawariya Cafe`,
                htmlContent,
              }),
            }),
          { maxRetries: 2, initialDelayMs: 300 }
        );

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error('[Brevo] Provider rejected a paid-order email request.');
          return { success: false, error: 'Email delivery failed.' };
        }

        const messageId = (data as { messageId?: string }).messageId;
        console.info('[Brevo] Paid-order email delivered.');
        return { success: true, messageId, simulated: false };
      });
    } catch {
      console.error('[Brevo] Paid-order email delivery failed.');
      return { success: false, error: 'Email delivery failed.' };
    }
  }

  return { success: false, simulated: false, error: 'Email delivery is not configured.' };
}

/**
 * Backward compatibility alias for sendBrevoOrderBillEmail
 */
export async function sendBrevoOrderBillEmail(
  options: SendBrevoOrderBillOptions
): Promise<BrevoEmailResult> {
  return sendBrevoOrderPaidEmail(options);
}
