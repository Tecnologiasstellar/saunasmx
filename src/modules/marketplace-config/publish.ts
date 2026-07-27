import { eq, inArray, notInArray, and } from 'drizzle-orm';
import type { Database } from '../database/client';
import { domain, marketplace, marketplaceConfigVersion, organization } from '../database/schema';
import type { MarketplaceConfig } from './types';

/**
 * Publishes on-disk marketplace configuration into the database.
 *
 * The files stay the authoring surface (ADR-006); the database holds the
 * published version so that projects, assignments and audit records can
 * reference a stable marketplace id and the exact config version in force.
 *
 * Idempotent: running it twice changes nothing.
 */
export async function publishMarketplaceConfigs(
  db: Database,
  configs: MarketplaceConfig[],
  options: { organizationName?: string } = {},
): Promise<Map<string, string>> {
  const organizationName = options.organizationName ?? 'Marketplace OS';

  const existingOrg = await db.select().from(organization).where(eq(organization.name, organizationName)).limit(1);
  const organizationId =
    existingOrg[0]?.id ??
    (await db.insert(organization).values({ name: organizationName }).returning({ id: organization.id }))[0]!.id;

  const idsBySlug = new Map<string, string>();

  for (const config of configs) {
    const [row] = await db
      .insert(marketplace)
      .values({
        organizationId,
        slug: config.slug,
        name: config.name,
        categoryKey: config.category,
        locale: config.localization.locale,
        currency: config.localization.currency,
        countryCode: config.localization.country,
        status: 'active',
        canonicalDomain: config.domain,
        themeKey: config.themeKey,
      })
      .onConflictDoUpdate({
        target: marketplace.slug,
        set: {
          name: config.name,
          categoryKey: config.category,
          locale: config.localization.locale,
          currency: config.localization.currency,
          countryCode: config.localization.country,
          canonicalDomain: config.domain,
          themeKey: config.themeKey,
        },
      })
      .returning({ id: marketplace.id });

    const marketplaceId = row!.id;
    idsBySlug.set(config.slug, marketplaceId);

    const hosts = [
      { hostname: config.domain, kind: 'canonical' as const, isCanonical: true, redirectTarget: null },
      ...config.aliases.map((alias) => ({
        hostname: alias,
        kind: 'alias' as const,
        isCanonical: false,
        redirectTarget: config.domain,
      })),
    ];

    for (const host of hosts) {
      await db
        .insert(domain)
        .values({ marketplaceId, ...host })
        .onConflictDoUpdate({
          target: domain.hostname,
          set: { marketplaceId, kind: host.kind, isCanonical: host.isCanonical, redirectTarget: host.redirectTarget },
        });
    }

    // Drop hostnames this marketplace no longer claims, so a removed alias
    // stops resolving instead of lingering as a dangling tenant mapping.
    const claimed = hosts.map((host) => host.hostname);
    await db
      .delete(domain)
      .where(and(eq(domain.marketplaceId, marketplaceId), notInArray(domain.hostname, claimed)));

    const published = await db
      .select({ id: marketplaceConfigVersion.id })
      .from(marketplaceConfigVersion)
      .where(
        and(
          eq(marketplaceConfigVersion.marketplaceId, marketplaceId),
          eq(marketplaceConfigVersion.version, config.configVersion),
        ),
      )
      .limit(1);

    if (published.length === 0) {
      await db
        .update(marketplaceConfigVersion)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(marketplaceConfigVersion.marketplaceId, marketplaceId),
            inArray(marketplaceConfigVersion.status, ['published']),
          ),
        );
      await db.insert(marketplaceConfigVersion).values({
        marketplaceId,
        version: config.configVersion,
        configJson: config,
        status: 'published',
        publishedAt: new Date(),
      });
    }
  }

  return idsBySlug;
}

/** Resolves a marketplace slug to its database id. */
export async function getMarketplaceId(db: Database, slug: string): Promise<string> {
  const [row] = await db.select({ id: marketplace.id }).from(marketplace).where(eq(marketplace.slug, slug)).limit(1);
  if (!row) throw new Error(`Marketplace "${slug}" is not published to the database. Run: npm run db:seed`);
  return row.id;
}
