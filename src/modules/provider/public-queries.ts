import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../database/client';
import {
  providerCompany,
  providerMarketplace,
  providerProfile,
  providerService,
  providerTerritory,
} from '../database/schema';

/**
 * Public read model for the directory and the homepage supplier strip.
 *
 * Two rules hold this file together:
 *
 * 1. Scope. Every query filters on `marketplaceId` and on
 *    `provider_marketplace.status = 'approved'`, in SQL. A provider that is
 *    pending on this marketplace is invisible here even if it is approved on
 *    another one.
 * 2. Truth. Nothing is returned that the database does not store. Coverage is
 *    the provider's own territories, services are its own service keys, and
 *    `verified` is `provider_profile.verification_status`, not a decoration.
 *    There is no rating, delivery time or warranty column, so this module
 *    cannot report one.
 *
 * No contact details are exposed: a consumer reaches a provider through the
 * questionnaire, which is where consent is captured.
 */

export type PublicProvider = {
  id: string;
  displayName: string;
  description: string | null;
  /** True only when the operator has verified this provider on this marketplace. */
  verified: boolean;
  /** Region codes the provider itself declared, e.g. ["CDMX"]. */
  regionCodes: string[];
  /** Leading postal-code digits the provider itself declared. */
  postalPrefixes: string[];
  /** Raw service keys; the caller maps them to labels via the questionnaire config. */
  serviceKeys: string[];
  approvedAt: Date | null;
};

export type PublicProviderFilters = {
  /** Exact `provider_territory.region_code`. */
  region?: string;
  /** Exact `provider_service.service_key`. */
  service?: string;
  sort?: 'name' | 'recent';
  limit?: number;
};

/** The facet values that actually exist for this marketplace. Drives the filter UI. */
export type ProviderFacets = { regions: string[]; services: string[] };

function approvedIn(marketplaceId: string) {
  return and(
    eq(providerMarketplace.marketplaceId, marketplaceId),
    eq(providerMarketplace.status, 'approved'),
    isNull(providerMarketplace.deletedAt),
    eq(providerCompany.status, 'active'),
    isNull(providerCompany.deletedAt),
  );
}

export async function listPublicProviders(
  db: Database,
  marketplaceId: string,
  filters: PublicProviderFilters = {},
): Promise<PublicProvider[]> {
  const { region, service, sort = 'name', limit = 60 } = filters;

  // Filters are resolved to company id sets first. Doing it as joins would
  // multiply rows per territory/service and silently change the result count.
  let restrictTo: string[] | null = null;

  if (region) {
    const rows = await db
      .selectDistinct({ id: providerTerritory.providerCompanyId })
      .from(providerTerritory)
      .where(and(eq(providerTerritory.marketplaceId, marketplaceId), eq(providerTerritory.regionCode, region)));
    restrictTo = rows.map((row) => row.id);
  }

  if (service) {
    const rows = await db
      .selectDistinct({ id: providerService.providerCompanyId })
      .from(providerService)
      .where(and(eq(providerService.marketplaceId, marketplaceId), eq(providerService.serviceKey, service)));
    const ids = new Set(rows.map((row) => row.id));
    restrictTo = restrictTo === null ? [...ids] : restrictTo.filter((id) => ids.has(id));
  }

  // An impossible filter combination means an empty directory, not every provider.
  if (restrictTo !== null && restrictTo.length === 0) return [];

  const companies = await db
    .select({
      id: providerCompany.id,
      displayName: providerCompany.displayName,
      description: providerProfile.description,
      verificationStatus: providerProfile.verificationStatus,
      approvedAt: providerMarketplace.approvedAt,
    })
    .from(providerCompany)
    .innerJoin(providerMarketplace, eq(providerMarketplace.providerCompanyId, providerCompany.id))
    .leftJoin(
      providerProfile,
      and(
        eq(providerProfile.providerCompanyId, providerCompany.id),
        eq(providerProfile.marketplaceId, marketplaceId),
      ),
    )
    .where(
      restrictTo === null
        ? approvedIn(marketplaceId)
        : and(approvedIn(marketplaceId), inArray(providerCompany.id, restrictTo)),
    )
    .orderBy(sort === 'recent' ? desc(providerMarketplace.approvedAt) : asc(providerCompany.displayName))
    .limit(limit);

  if (companies.length === 0) return [];

  const ids = companies.map((company) => company.id);

  const [territories, services] = await Promise.all([
    db
      .select({
        companyId: providerTerritory.providerCompanyId,
        regionCode: providerTerritory.regionCode,
        postalPrefix: providerTerritory.postalPrefix,
      })
      .from(providerTerritory)
      .where(and(eq(providerTerritory.marketplaceId, marketplaceId), inArray(providerTerritory.providerCompanyId, ids)))
      .orderBy(asc(providerTerritory.postalPrefix)),
    db
      .select({ companyId: providerService.providerCompanyId, serviceKey: providerService.serviceKey })
      .from(providerService)
      .where(and(eq(providerService.marketplaceId, marketplaceId), inArray(providerService.providerCompanyId, ids)))
      .orderBy(asc(providerService.serviceKey)),
  ]);

  return companies.map((company) => {
    const own = territories.filter((row) => row.companyId === company.id);
    return {
      id: company.id,
      displayName: company.displayName,
      description: company.description,
      verified: company.verificationStatus === 'verified',
      regionCodes: [...new Set(own.map((row) => row.regionCode).filter((code): code is string => !!code))],
      postalPrefixes: [...new Set(own.map((row) => row.postalPrefix))],
      serviceKeys: services.filter((row) => row.companyId === company.id).map((row) => row.serviceKey),
      approvedAt: company.approvedAt,
    };
  });
}

/** Count of approved providers. Used for the result count and SEO eligibility. */
export async function countPublicProviders(db: Database, marketplaceId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(providerCompany)
    .innerJoin(providerMarketplace, eq(providerMarketplace.providerCompanyId, providerCompany.id))
    .where(approvedIn(marketplaceId));
  return row?.total ?? 0;
}

/**
 * Facets restricted to approved providers, so the filter UI can never offer a
 * value that returns nothing.
 */
export async function getProviderFacets(db: Database, marketplaceId: string): Promise<ProviderFacets> {
  const approved = await db
    .select({ id: providerCompany.id })
    .from(providerCompany)
    .innerJoin(providerMarketplace, eq(providerMarketplace.providerCompanyId, providerCompany.id))
    .where(approvedIn(marketplaceId));

  const ids = approved.map((row) => row.id);
  if (ids.length === 0) return { regions: [], services: [] };

  const [regions, services] = await Promise.all([
    db
      .selectDistinct({ value: providerTerritory.regionCode })
      .from(providerTerritory)
      .where(and(eq(providerTerritory.marketplaceId, marketplaceId), inArray(providerTerritory.providerCompanyId, ids)))
      .orderBy(asc(providerTerritory.regionCode)),
    db
      .selectDistinct({ value: providerService.serviceKey })
      .from(providerService)
      .where(and(eq(providerService.marketplaceId, marketplaceId), inArray(providerService.providerCompanyId, ids)))
      .orderBy(asc(providerService.serviceKey)),
  ]);

  return {
    regions: regions.map((row) => row.value).filter((value): value is string => !!value),
    services: services.map((row) => row.value),
  };
}
