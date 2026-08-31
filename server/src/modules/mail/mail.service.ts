import { Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';
const MAILERSEND_API = 'https://api.mailersend.com/v1/email';

type SendInput = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Transactional email.
 *
 * Two providers are supported and the one to use is inferred from whichever key is
 * present, so switching is a change of environment variable rather than of code —
 * which is how this project ended up on Brevo after starting on MailerSend.
 *
 * Sending never throws. Every caller is either detached (a notification) or is
 * deliberately vague about the outcome (password reset, which must not reveal whether
 * an address exists), so a provider outage must not become a 500.
 *
 * With nothing configured the mail is logged instead of sent, which keeps local
 * development working and makes reset links copy-pasteable from the terminal.
 */
@Injectable()
export class MailService {
  /** Reused across sends: a new SMTP connection per email is slow and wasteful. */
  private transporter: Transporter | null = null;

  private get brevoKey() {
    return process.env.BREVO_API_KEY?.trim();
  }

  private get smtpKey() {
    return process.env.BREVO_SMTP_KEY?.trim();
  }

  private get smtpLogin() {
    return process.env.BREVO_SMTP_LOGIN?.trim();
  }

  private get mailersendKey() {
    return process.env.MAILERSEND_API_KEY?.trim();
  }

  // Truthiness, not ??: an env var set to an empty string is neither null nor
  // undefined, so ?? would happily send an empty from-address and earn a 422.
  private get fromEmail() {
    return process.env.MAIL_FROM_EMAIL?.trim() || '';
  }

  private get fromName() {
    return process.env.MAIL_FROM_NAME?.trim() || 'Reelink';
  }

  async send(input: SendInput): Promise<boolean> {
    const { to, subject, text } = input;

    const hasSmtp = !!this.smtpKey && !!this.smtpLogin;
    const reason = !this.brevoKey && !hasSmtp && !this.mailersendKey
      ? 'no mail provider configured (set BREVO_SMTP_KEY or BREVO_API_KEY)'
      : !this.fromEmail
        ? 'MAIL_FROM_EMAIL is not set'
        : null;

    // No point attempting a call that is certain to fail. Log it instead, so the
    // content — including any reset link — is recoverable from the terminal.
    if (reason) {
      console.warn(
        `[mail] ${reason} — "${subject}" was not sent to ${to}.\n` +
          `[mail] ${text.replace(/\n+/g, ' ').slice(0, 400)}`,
      );
      return false;
    }

    // REST first when an API key exists — better errors and no connection to hold
    // open. SMTP is the fallback, and is what Brevo's SMTP keys are actually for.
    if (this.brevoKey) return this.sendViaBrevo(input);
    if (hasSmtp) return this.sendViaSmtp(input);
    return this.sendViaMailerSend(input);
  }

  private async sendViaSmtp({ to, toName, subject, html, text }: SendInput) {
    try {
      this.transporter ??= createTransport({
        host: process.env.BREVO_SMTP_HOST?.trim() || 'smtp-relay.brevo.com',
        port: Number(process.env.BREVO_SMTP_PORT ?? 587),
        // 587 is STARTTLS, so the connection begins in the clear and upgrades.
        secure: false,
        auth: { user: this.smtpLogin as string, pass: this.smtpKey as string },
      });

      await this.transporter.sendMail({
        from: { address: this.fromEmail, name: this.fromName },
        to: toName ? `"${toName}" <${to}>` : to,
        subject,
        html,
        text,
      });
      return true;
    } catch (err) {
      console.error(`[mail] SMTP refused "${subject}": ${(err as Error).message}`);
      // A broken connection must not be reused for every later send.
      this.transporter = null;
      return false;
    }
  }

  private async sendViaBrevo({ to, toName, subject, html, text }: SendInput) {
    return this.post(
      BREVO_API,
      { 'Content-Type': 'application/json', 'api-key': this.brevoKey as string },
      {
        sender: { email: this.fromEmail, name: this.fromName },
        to: [{ email: to, ...(toName ? { name: toName } : {}) }],
        subject,
        htmlContent: html,
        textContent: text,
      },
      subject,
    );
  }

  private async sendViaMailerSend({ to, toName, subject, html, text }: SendInput) {
    return this.post(
      MAILERSEND_API,
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.mailersendKey as string}`,
      },
      {
        from: { email: this.fromEmail, name: this.fromName },
        to: [{ email: to, ...(toName ? { name: toName } : {}) }],
        subject,
        html,
        text,
      },
      subject,
    );
  }

  private async post(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    subject: string,
  ): Promise<boolean> {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

      if (!res.ok) {
        // The body carries the real reason — an unverified sender looks identical to
        // a bad key without it, which is a long afternoon of guessing.
        console.error(
          `[mail] provider refused "${subject}" (${res.status}): ${(await res.text()).slice(0, 400)}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error('[mail] send failed:', (err as Error).message);
      return false;
    }
  }
}
