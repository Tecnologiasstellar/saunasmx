import { describe, expect, it } from 'vitest';
import { redact } from '@/modules/observability/logger';

/**
 * docs/10-security-privacy.md: logs, audit metadata and analytics properties
 * must never carry an exact street address or a WhatsApp number. Redaction
 * happens once, here, rather than trusting every call site to remember.
 */
describe('redact', () => {
  it('scrubs a street_address key regardless of casing convention', () => {
    const out = redact({ street_address: 'Sierra Madre 123', streetAddress: 'Sierra Madre 123' }) as Record<string, unknown>;
    expect(out.street_address).toBe('[redacted]');
    expect(out.streetAddress).toBe('[redacted]');
  });

  it('scrubs a whatsapp key', () => {
    const out = redact({ whatsapp: '5512345678' }) as Record<string, unknown>;
    expect(out.whatsapp).toBe('[redacted]');
  });

  it('still scrubs a bare long-digit-run value even under an unrelated key', () => {
    const out = redact({ note: 'contact me at 5512345678 please' }) as Record<string, unknown>;
    expect(out.note).toContain('[phone]');
    expect(out.note).not.toContain('5512345678');
  });
});
