/**
 * In-memory sliding-window rate limiter.
 *
 * Deliberately not a service: it costs nothing, needs no dependency, and stops
 * the abuse cases in docs/10 (repeated form submission, login brute force).
 *
 * Limitation, stated rather than hidden: the window is per process. On several
 * serverless instances the effective limit is per instance. The database-side
 * duplicate and spam checks in submit-project.ts are the durable protection;
 * this is the cheap first line.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowSeconds: number, now = Date.now()): RateLimitResult {
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Test seam; also called opportunistically to stop the map growing without bound. */
export function pruneRateLimits(now = Date.now()): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export function resetRateLimits(): void {
  windows.clear();
}

/**
 * Best-effort client identity. Behind Vercel this is the real client IP; with
 * no proxy header it degrades to a shared bucket rather than failing open per
 * request.
 */
export function clientKey(headers: Headers, salt: string): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || headers.get('x-real-ip') || 'unknown';
  return `${salt}:${ip}`;
}
