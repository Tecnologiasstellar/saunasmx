import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@/modules/database/client';
import { analyticsEvent } from '@/modules/database/schema';
import { track } from '@/modules/observability/audit';
import { createTestDatabase } from '../helpers/database';
import { publishRepoConfigs, type PublishedMarketplaces } from '../helpers/fixtures';

/**
 * Configurator funnel analytics (Phase 4 of the /disena-tu-sauna build).
 *
 * The events API route (src/app/api/marketplaces/[slug]/events/route.ts)
 * validates the request and then calls `track` — this exercises that same
 * write path against a real database, closing the gap Phase 2/3 left open:
 * confirming an event a browser fires actually lands in `analytics_event`,
 * not just that `sendBeacon` was called.
 */

let db: Database;
let published: PublishedMarketplaces;

beforeEach(async () => {
  db = await createTestDatabase();
  published = await publishRepoConfigs(db);
});

describe('configurator analytics', () => {
  it('records each configurator funnel event with its marketplace and properties', async () => {
    const marketplaceId = published.id('suanas-mx');

    for (const name of [
      'configurator_started',
      'configurator_step_completed',
      'configurator_abandoned',
      'configurator_completed',
      'configurator_to_cotizar_handoff',
    ] as const) {
      await track(db, {
        name,
        marketplaceId,
        properties: { marketplaceSlug: 'suanas-mx', configuratorVersion: 1, stepId: 'size' },
      });
    }

    const rows = await db.select().from(analyticsEvent).where(eq(analyticsEvent.marketplaceId, marketplaceId));
    const byName = new Map(rows.map((row) => [row.name, row]));

    expect(byName.size).toBe(5);
    for (const name of [
      'configurator_started',
      'configurator_step_completed',
      'configurator_abandoned',
      'configurator_completed',
      'configurator_to_cotizar_handoff',
    ]) {
      const row = byName.get(name);
      expect(row, name).toBeDefined();
      expect(row!.propertiesJson).toMatchObject({ marketplaceSlug: 'suanas-mx', configuratorVersion: 1 });
    }
  });

  it('redacts a sensitive key even if a caller passed one in by mistake', async () => {
    // `track` redacts by key name (see redact() in observability/logger.ts) —
    // the events route itself never forwards an email (its bodySchema has no
    // such field), but this proves the write path itself can't leak one even
    // if a future caller mistakenly did.
    const marketplaceId = published.id('suanas-mx');
    await track(db, {
      name: 'configurator_completed',
      marketplaceId,
      properties: { marketplaceSlug: 'suanas-mx', configuratorVersion: 1, email: 'leaked@example.com' },
    });

    const [row] = await db.select().from(analyticsEvent).where(eq(analyticsEvent.marketplaceId, marketplaceId));
    expect((row?.propertiesJson as Record<string, unknown> | null)?.email).toBe('[redacted]');
  });
});
