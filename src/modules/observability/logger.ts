/**
 * Structured logging with PII redaction.
 *
 * docs/10-security-privacy.md forbids phone numbers, emails, addresses and free
 * text in logs. Redaction happens here rather than at every call site, because
 * a call site that forgets is a privacy incident.
 */

const SENSITIVE_KEYS = new Set([
  'email',
  'phone',
  'name',
  'contact',
  'address',
  'postalcode',
  'postal_code',
  'notes',
  'body',
  'answers',
  'token',
  'password',
  'secret',
  'authorization',
  'apikey',
  'api_key',
]);

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONG_DIGITS = /\+?\d[\d\s().-]{7,}\d/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.replace(EMAIL_PATTERN, '[email]').replace(LONG_DIGITS, '[phone]');
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(item, depth + 1);
    }
    return out;
  }
  return '[unloggable]';
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};

/** Correlates an inbound request with every log line, event and error it produces. */
export function newCorrelationId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}
