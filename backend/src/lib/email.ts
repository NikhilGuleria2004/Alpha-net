import nodemailer from 'nodemailer'
import { logger } from './logger.js'

function buildTransporter() {
  const host = process.env.SMTP_HOST?.trim()
  const port = Number(process.env.SMTP_PORT) || 587
  const secureEnv = (process.env.SMTP_SECURE ?? '').trim().toLowerCase()
  // Default: secure (implicit TLS) only on port 465. Port 587 uses STARTTLS
  // upgrade (secure=false), so an unset SMTP_SECURE must NOT force TLS on 587.
  const secure = secureEnv ? secureEnv === 'true' : port === 465
  const user = process.env.SMTP_USER?.trim() || ''
  const pass = process.env.SMTP_PASS?.trim() || ''

  if (host) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    })
  }

  // No SMTP configured: log-only dev transport so nothing throws.
  return nodemailer.createTransport({ jsonTransport: true })
}

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null

function getTransporter() {
  if (!cachedTransporter) cachedTransporter = buildTransporter()
  return cachedTransporter
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || 'no-reply@alphanet.local'
}

function getAppUrl(): string {
  return process.env.APP_URL?.trim().replace(/\/+$/, '') || 'http://localhost:5173'
}

export function emailEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim())
}

async function sendMail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const info = await getTransporter().sendMail({
    from: `"Eniac" <${getFromAddress()}>`,
    to,
    subject,
    html,
  })
  logger.info({ to, subject, messageId: info.messageId }, 'email sent')
}

function inviteLinkFor(token: string): string {
  return `${getAppUrl()}/invite?token=${token}`
}

function resetLinkFor(token: string): string {
  return `${getAppUrl()}/reset-password?token=${token}`
}

function htmlShell({ subject, body }: { subject: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;line-height:1.6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9">
    <tr>
      <td align="center" style="padding:40px 16px">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden">
          <tr>
            <td style="padding:32px 32px 24px;background-color:#0f172a;background-image:linear-gradient(135deg,#0f172a,#1e3a5f);color:#ffffff;text-align:center">
              <h1 style="margin:0;font-size:22px;font-weight:600;letter-spacing:-0.01em">Eniac</h1>
              <p style="margin:6px 0 0;font-size:14px;color:#94a3b8">Time tracking &amp; invoicing for modern teams</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
              <p style="margin:0;font-size:12px;color:#94a3b8">
                You received this email because you have an account or pending invite with Eniac.
                If you did not expect this message, please ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendInviteEmail(email: string, token: string): Promise<void> {
  const link = inviteLinkFor(token)
  const subject = 'You’ve been invited to Eniac'
  const body = `
    <p style="margin:0 0 16px;font-size:15px">
      Someone invited you to join <strong>Eniac</strong>. Click the button below
      to set up your account and sign in.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:12px 0 24px">
          <a href="${link}"
             style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:500">
            Set up my account
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-bottom:32px">
          <p style="margin:0;font-size:13px;color:#64748b">
            If the button above does not work, copy and paste this link into your browser:<br/>
            <a href="${link}" style="color:#2563eb">${link}</a>
          </p>
        </td>
      </tr>
    </table>
  `
  await sendMail({ to: email, subject, html: htmlShell({ subject, body }) })
}

export async function sendResendInviteEmail(email: string, token: string): Promise<void> {
  const link = inviteLinkFor(token)
  const subject = 'Your Eniac invite has been re-sent'
  const body = `
    <p style="margin:0 0 16px;font-size:15px">
      Your invite to join <strong>Eniac</strong> was re-sent. If you did not
      request this, you can safely ignore this email - the previous invite will
      expire automatically.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:12px 0 24px">
          <a href="${link}"
             style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:500">
            Set up my account
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-bottom:32px">
          <p style="margin:0;font-size:13px;color:#64748b">
            Link: <a href="${link}" style="color:#2563eb">${link}</a>
          </p>
        </td>
      </tr>
    </table>
  `
  await sendMail({ to: email, subject, html: htmlShell({ subject, body }) })
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const link = resetLinkFor(token)
  const subject = 'Reset your Eniac password'
  const body = `
    <p style="margin:0 0 16px;font-size:15px">
      You requested a password reset for your Eniac account. Click the button
      below to choose a new password. This link expires in <strong>1 hour</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:12px 0 24px">
          <a href="${link}"
             style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:500">
            Reset my password
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-bottom:32px">
          <p style="margin:0;font-size:13px;color:#64748b">
            If the button above does not work, copy and paste this link:<br/>
            <a href="${link}" style="color:#2563eb">${link}</a>
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 0 0;font-size:13px;color:#94a3b8">
      If you did not request a password reset, you can safely ignore this email.
      Your password will remain unchanged.
    </p>
  `
  await sendMail({ to: email, subject, html: htmlShell({ subject, body }) })
}

export async function sendLoginOtpEmail(email: string, otp: string): Promise<void> {
  const subject = 'Your Eniac sign-in code'
  const body = `
    <p style="margin:0 0 16px;font-size:15px">
      Someone requested a sign-in code for this email address. Use the code
      below to log in to <strong>Eniac</strong>. It expires in
      <strong>10 minutes</strong> and can only be used once.
    </p>
    <div align="center" style="padding:12px 0 24px">
      <span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:0.35em;text-indent:0.35em;background-color:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:14px 20px;color:#0f172a">${otp}</span>
    </div>
    <p style="margin:0;font-size:13px;color:#94a3b8">
      If you did not request this code, you can safely ignore this email.
      Never share this code with anyone — Eniac staff will never ask for it.
    </p>
  `
  await sendMail({ to: email, subject, html: htmlShell({ subject, body }) })
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const subject = 'Welcome to Eniac!'
  const body = `
    <p style="margin:0 0 16px;font-size:15px">
      Hi ${name},<br/><br/>
      Welcome to <strong>Eniac</strong>! Your account is now active and you can
      sign in with your email and password.<br/><br/>
      Get started by signing in at
      <a href="${getAppUrl()}/userlog" style="color:#2563eb">${getAppUrl()}/userlog</a>.
    </p>
  `
  await sendMail({ to: email, subject, html: htmlShell({ subject, body }) })
}

export async function sendInvoiceEmail(
  to: string,
  invoiceNumber: string,
  projectName: string,
  pdfBuffer: Buffer,
  pdfFilename: string,
): Promise<void> {
  const subject = `Invoice ${invoiceNumber} - ${projectName}`
  const body = `
    <p style="margin:0 0 16px;font-size:15px">
      Please find attached invoice <strong>${invoiceNumber}</strong> for
      <strong>${projectName}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px">
      You can also view and download the invoice from your account dashboard.
    </p>
    <p style="margin:0;font-size:13px;color:#64748b">
      This is an automated message from Eniac. Do not reply to this email.
    </p>
  `
  const info = await getTransporter().sendMail({
    from: `"Eniac" <${getFromAddress()}>`,
    to,
    subject,
    html: htmlShell({ subject, body }),
    attachments: [
      {
        filename: pdfFilename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  })
  logger.info({ to, subject, invoiceNumber, messageId: info.messageId }, 'invoice email sent')
}
