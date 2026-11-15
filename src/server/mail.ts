import nodemailer, { type Transporter } from "nodemailer";

/**
 * Transactional mail.
 *
 * Everything the platform sends to a user goes through this module so there is
 * exactly one place that knows which provider is in use. Today that provider is
 * Gmail SMTP with an app password (see .env.example); swapping to SES, Postmark
 * or Resend later means rewriting this file and nothing else.
 *
 * Design rules, because these are the ones that are easy to get wrong:
 *
 * 1. Never throw to the caller. A failed verification email must not fail the
 *    registration that triggered it, and a failed reset email must not reveal
 *    whether an account exists. Callers get a boolean and log the reason.
 * 2. Never log the recipient's address at a level that ends up in a shared log
 *    without it being deliberate. Addresses are masked in log lines.
 * 3. Send is fire-and-forget with a timeout, so a hung SMTP connection cannot
 *    hold an HTTP request open.
 */

const MAIL_TIMEOUT_MS = Number(process.env.MAIL_TIMEOUT_MS) > 0 ? Number(process.env.MAIL_TIMEOUT_MS) : 10_000;

let transporter: Transporter | null = null;
let transporterError: string | null = null;

interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
  fromAddress: string;
}

function readConfig(): MailConfig | null {
  const user = String(process.env.MAIL_USER || "").trim();
  const pass = String(process.env.MAIL_PASSWORD || "").trim();

  // Gmail is the documented default so a fresh deploy only has to fill in the
  // two credentials. Any other provider sets MAIL_HOST explicitly.
  const host = String(process.env.MAIL_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.MAIL_PORT) > 0 ? Number(process.env.MAIL_PORT) : 465;
  const fromAddress = String(process.env.MAIL_FROM || user).trim();
  const fromName = String(process.env.MAIL_FROM_NAME || "RentDue").trim();

  if (!user || !pass) return null;
  if (!fromAddress) return null;

  return { host, port, user, pass, fromName, fromAddress };
}

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (transporterError) return null;

  const config = readConfig();
  if (!config) {
    transporterError = "Mail is not configured (MAIL_USER / MAIL_PASSWORD missing).";
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // 465 is implicit TLS; 587 is STARTTLS. Both are common for Gmail
      // depending on the account, so pick from the port rather than guessing.
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: MAIL_TIMEOUT_MS,
      greetingTimeout: MAIL_TIMEOUT_MS,
      socketTimeout: MAIL_TIMEOUT_MS,
    });
    return transporter;
  } catch (error) {
    transporterError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

/** True when mail credentials are present. Does not prove they work. */
export function isMailConfigured(): boolean {
  return readConfig() !== null;
}

function maskAddress(address: string): string {
  const [local, domain] = String(address || "").split("@");
  if (!domain) return "(invalid)";
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send one transactional email. Resolves true on success.
 *
 * A missing configuration resolves false rather than throwing, so a deployment
 * without mail credentials degrades to "email not available" instead of taking
 * registration or password reset down with it.
 */
export async function sendMail(options: SendMailOptions): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn(`[Mail] Skipped "${options.subject}" to ${maskAddress(options.to)}: ${transporterError}`);
    return false;
  }

  const config = readConfig();
  if (!config) return false;

  try {
    await mailer.sendMail({
      from: `"${config.fromName}" <${config.fromAddress}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      // When no HTML is supplied, send the plain text only. Some clients show
      // a plaintext-only mail as more trustworthy, which matters for a mail
      // whose entire job is to carry a code.
      ...(options.html ? { html: options.html } : {}),
    });
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[Mail] Send failed for ${maskAddress(options.to)}: ${reason}`);
    return false;
  }
}

/** Shared shell so every mail looks like it came from the same product. */
function wrap(title: string, bodyHtml: string, footerNote?: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
      <tr>
        <td>
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${title}</h1>
          ${bodyHtml}
          ${
            footerNote
              ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#64748b;">${footerNote}</p>`
              : ""
          }
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Password-reset code mail.
 *
 * Deliberately carries a code, not a link. A link would need a token table and
 * a public route that accepts it; a code reuses the same verification path the
 * user already knows, and it cannot be forwarded to a third party by a mail
 * scanner that prefetches links.
 */
export async function sendPasswordResetCode(
  email: string,
  code: string,
  expiresMinutes: number
): Promise<boolean> {
  const html = wrap(
    "Reset your password",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
       Use this code to reset your password. It expires in ${expiresMinutes} minutes.
     </p>
     <p style="margin:0 0 24px;font-size:30px;font-weight:800;letter-spacing:0.28em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
       ${code}
     </p>
     <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">
       After you sign in, go to <strong>Profile &rarr; Account settings</strong> to set a new password.
     </p>`,
    "If you did not request this, you can ignore this email. Your password has not changed."
  );

  return sendMail({
    to: email,
    subject: "Your password reset code",
    text: [
      "Use this code to reset your password.",
      "",
      code,
      "",
      `It expires in ${expiresMinutes} minutes.`,
      "",
      "After you sign in, go to Profile -> Account settings to set a new password.",
      "",
      "If you did not request this, you can ignore this email. Your password has not changed.",
    ].join("\n"),
    html,
  });
}

/**
 * Signup verification mail.
 *
 * Registration stays instant, but a reset is only ever sent to an address that
 * has been proven, so an unverified address cannot be used to mail a stranger.
 */
export async function sendEmailVerificationCode(
  email: string,
  code: string,
  expiresMinutes: number
): Promise<boolean> {
  const html = wrap(
    "Confirm your email",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
       Confirm this address belongs to you. The code expires in ${expiresMinutes} minutes.
     </p>
     <p style="margin:0;font-size:30px;font-weight:800;letter-spacing:0.28em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
       ${code}
     </p>`,
    "If you did not create an account, you can ignore this email."
  );

  return sendMail({
    to: email,
    subject: "Confirm your email address",
    text: [
      "Confirm this address belongs to you.",
      "",
      code,
      "",
      `The code expires in ${expiresMinutes} minutes.`,
      "",
      "If you did not create an account, you can ignore this email.",
    ].join("\n"),
    html,
  });
}