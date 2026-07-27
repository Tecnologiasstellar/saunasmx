import { log } from '../observability/logger';

/**
 * Email adapter.
 *
 * Every external service in this codebase has an interface and a deterministic
 * fake (docs/01-architecture.md). Tests and local development use the fake; a
 * `RESEND_API_KEY` switches on the real one.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailResult = { providerMessageId: string };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}

/** Deterministic fake. Records messages so tests can assert on them. */
export class FakeEmailProvider implements EmailProvider {
  readonly name = 'fake';
  readonly sent: EmailMessage[] = [];
  /** Set to make the next N sends fail, for retry tests. */
  failuresRemaining = 0;

  async send(message: EmailMessage): Promise<EmailResult> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('fake email provider failure');
    }
    this.sent.push(message);
    // Subject only: the body can contain names and project details.
    log.info('email.sent', { provider: this.name, subject: message.subject });
    return { providerMessageId: `fake_${this.sent.length}` };
  }

  reset(): void {
    this.sent.length = 0;
    this.failuresRemaining = 0;
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }),
    });

    if (!response.ok) {
      // Status only — the response body can echo the recipient address back.
      throw new Error(`resend responded ${response.status}`);
    }
    const body = (await response.json()) as { id?: string };
    return { providerMessageId: body.id ?? 'unknown' };
  }
}

let override: EmailProvider | null = null;

/** Test seam. */
export function setEmailProvider(provider: EmailProvider | null): void {
  override = provider;
}

export function getEmailProvider(): EmailProvider {
  if (override) return override;
  const key = process.env.RESEND_API_KEY?.trim();
  if (process.env.EMAIL_ADAPTER === 'resend' && key) {
    return new ResendEmailProvider(key, process.env.EMAIL_FROM?.trim() || 'no-reply@example.com');
  }
  return new FakeEmailProvider();
}
