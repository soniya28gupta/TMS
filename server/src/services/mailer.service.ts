import nodemailer, { type Transporter } from 'nodemailer';
import { prisma } from '../db';
import { env } from '../env';

let transporter: Transporter | null = null;
let transporterReady = false;

function getTransporter(): Transporter | null {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 8_000,
    });
    transporterReady = true;
  }
  return transporterReady ? transporter : null;
}

/**
 * Mail is queued to the database rather than sent inline. Free SMTP tiers are
 * rate-limited and flaky; the outbox gives retries, an audit trail, and keeps
 * request latency independent of the mail provider.
 */
export async function queueEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  await prisma.emailOutbox.create({
    data: { to: input.to, subject: input.subject, html: input.html, text: input.text ?? null },
  });
}

const MAX_ATTEMPTS = 5;

async function sendViaResend(mail: {
  to: string;
  subject: string;
  html: string;
  text?: string | null;
}): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.resendApiKey}`,
    },
    body: JSON.stringify({
      from: env.smtp.from,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text || undefined,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Resend delivery failed (${res.status}): ${errText}`);
  }
}

/** Drains queued mail. Called by the scheduler; safe to call concurrently. */
export async function flushOutbox(limit = 20): Promise<{ sent: number; failed: number }> {
  const pending = await prisma.emailOutbox.findMany({
    where: { status: 'QUEUED', attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  if (!pending.length) return { sent: 0, failed: 0 };

  const mailer = getTransporter();
  let sent = 0;
  let failed = 0;

  for (const mail of pending) {
    try {
      if (env.resendApiKey) {
        await sendViaResend(mail);
      } else if (mailer) {
        await mailer.sendMail({
          from: env.smtp.from,
          to: mail.to,
          subject: mail.subject,
          html: mail.html,
          text: mail.text ?? undefined,
        });
      } else {
        // No live mail transport configured: dev mode outbox logging
        console.log(`[mail:dev] to=${mail.to} subject="${mail.subject}"`);
      }
      await prisma.emailOutbox.update({
        where: { id: mail.id },
        data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
      });
      sent += 1;
    } catch (error) {
      const attempts = mail.attempts + 1;
      await prisma.emailOutbox.update({
        where: { id: mail.id },
        data: {
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'QUEUED',
          lastError: (error as Error).message.slice(0, 500),
        },
      });
      failed += 1;
    }
  }
  return { sent, failed };
}

export function renderPasswordResetEmail(input: {
  userName: string;
  resetUrl: string;
  appName?: string;
  expiresInMinutes?: number;
}): string {
  const appName = input.appName ?? 'TaskFlow';
  const userName = escapeHtml(input.userName || 'User');
  const resetUrl = input.resetUrl;
  const minutes = input.expiresInMinutes ?? 20;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your ${appName} password</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:540px;background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color:#2563eb;padding:24px 32px;text-align:left;">
              <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">${appName}</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#0f172a;">Password Reset Request</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155;">
                Hello <strong>${userName}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#334155;">
                We received a request to reset the password for your <strong>${appName}</strong> account. Click the button below to choose a new password:
              </p>
              <!-- Action Button -->
              <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:#2563eb;">
                    <a href="${resetUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Expiration Notice -->
              <div style="background-color:#f8fafc;border-left:4px solid #2563eb;padding:12px 16px;margin:0 0 24px;border-radius:4px;">
                <p style="margin:0;font-size:13px;line-height:20px;color:#475569;">
                  ⏱ <strong>Time-sensitive:</strong> This reset link is single-use and will expire in <strong>${minutes} minutes</strong>.
                </p>
              </div>
              <!-- Fallback Link -->
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
                If the button above does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;word-break:break-all;">
                <a href="${resetUrl}" style="color:#2563eb;text-decoration:underline;">${resetUrl}</a>
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;" />
              <!-- Security Notification -->
              <p style="margin:0;font-size:12px;line-height:18px;color:#94a3b8;">
                🛡️ <strong>Security Notice:</strong> If you did not request this password reset, no action is needed. Your account remains completely secure and your current password has not been changed.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                ${appName} Task Management System · Automated notification
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderEmail(title: string, body: string, actionUrl?: string): string {
  const button = actionUrl
    ? `<p style="margin:24px 0"><a href="${actionUrl}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Open in portal</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;border:1px solid #e5e7eb">
    <h2 style="margin:0 0 12px;font-size:18px;color:#111827">${escapeHtml(title)}</h2>
    <div style="color:#374151;font-size:14px;line-height:1.6">${body}</div>
    ${button}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
    <p style="color:#9ca3af;font-size:12px;margin:0">Automated message from your Task Management System.</p>
  </div></body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
