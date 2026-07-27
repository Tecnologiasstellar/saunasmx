import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database, Tx } from '../database/client';
import {
  project,
  projectLocation,
  projectRequirement,
  providerAssignment,
  providerCompany,
  providerMarketplace,
  providerPerformanceSnapshot,
  providerReview,
  providerService,
  providerTerritory,
} from '../database/schema';
import type { ProjectFacts, ProviderCandidate } from './evaluate';
import type { BudgetRange } from './budget';

/**
 * Reads the facts the matching engine needs. Kept separate from `evaluate.ts`
 * so the ranking logic stays a pure, exhaustively testable function.
 */

/** Assignments that still occupy a provider's capacity. */
const OPEN_STATUSES = ['assigned', 'accepted'] as const;

export async function loadCandidates(db: Database | Tx, marketplaceId: string): Promise<ProviderCandidate[]> {
  const relationships = await db
    .select({
      providerCompanyId: providerMarketplace.providerCompanyId,
      status: providerMarketplace.status,
      capacityLimit: providerMarketplace.capacityLimit,
      displayName: providerCompany.displayName,
    })
    .from(providerMarketplace)
    .innerJoin(providerCompany, eq(providerCompany.id, providerMarketplace.providerCompanyId))
    .where(
      and(
        eq(providerMarketplace.marketplaceId, marketplaceId),
        isNull(providerMarketplace.deletedAt),
        isNull(providerCompany.deletedAt),
      ),
    );

  if (relationships.length === 0) return [];
  const companyIds = relationships.map((row) => row.providerCompanyId);

  const services = await db
    .select()
    .from(providerService)
    .where(and(eq(providerService.marketplaceId, marketplaceId), inArray(providerService.providerCompanyId, companyIds)));

  const territories = await db
    .select()
    .from(providerTerritory)
    .where(and(eq(providerTerritory.marketplaceId, marketplaceId), inArray(providerTerritory.providerCompanyId, companyIds)));

  // Open assignments are counted marketplace-wide for the provider: capacity is
  // about the team's ability to respond, not about one lead.
  const openAssignments = await db
    .select({ providerCompanyId: providerAssignment.providerCompanyId, id: providerAssignment.id })
    .from(providerAssignment)
    .where(
      and(
        inArray(providerAssignment.providerCompanyId, companyIds),
        inArray(providerAssignment.status, [...OPEN_STATUSES]),
        isNull(providerAssignment.deletedAt),
      ),
    );

  const reviews = await db
    .select({ providerCompanyId: providerReview.providerCompanyId, rating: providerReview.rating })
    .from(providerReview)
    .where(and(inArray(providerReview.providerCompanyId, companyIds), eq(providerReview.status, 'published')));

  const snapshots = await db
    .select()
    .from(providerPerformanceSnapshot)
    .where(
      and(
        eq(providerPerformanceSnapshot.marketplaceId, marketplaceId),
        inArray(providerPerformanceSnapshot.providerCompanyId, companyIds),
      ),
    )
    .orderBy(desc(providerPerformanceSnapshot.periodEnd));

  const openCount = new Map<string, number>();
  for (const row of openAssignments) openCount.set(row.providerCompanyId, (openCount.get(row.providerCompanyId) ?? 0) + 1);

  const ratingTotals = new Map<string, { sum: number; count: number }>();
  for (const row of reviews) {
    const current = ratingTotals.get(row.providerCompanyId) ?? { sum: 0, count: 0 };
    ratingTotals.set(row.providerCompanyId, { sum: current.sum + row.rating, count: current.count + 1 });
  }

  const latestSnapshot = new Map<string, number>();
  for (const row of snapshots) {
    if (!latestSnapshot.has(row.providerCompanyId)) latestSnapshot.set(row.providerCompanyId, row.score);
  }

  return relationships.map((relationship): ProviderCandidate => {
    const rating = ratingTotals.get(relationship.providerCompanyId);
    return {
      providerCompanyId: relationship.providerCompanyId,
      displayName: relationship.displayName,
      status: relationship.status,
      capacityLimit: relationship.capacityLimit,
      openAssignments: openCount.get(relationship.providerCompanyId) ?? 0,
      averageRating: rating && rating.count > 0 ? rating.sum / rating.count : null,
      responseScore: latestSnapshot.get(relationship.providerCompanyId) ?? null,
      services: services
        .filter((service) => service.providerCompanyId === relationship.providerCompanyId)
        .map((service) => ({ serviceKey: service.serviceKey, minProjectValueMinor: service.minProjectValueMinor })),
      postalPrefixes: territories
        .filter((territory) => territory.providerCompanyId === relationship.providerCompanyId)
        .map((territory) => territory.postalPrefix),
    };
  });
}

export async function loadProjectFacts(db: Database | Tx, projectId: string): Promise<ProjectFacts> {
  const [location] = await db.select().from(projectLocation).where(eq(projectLocation.projectId, projectId)).limit(1);
  const requirements = await db.select().from(projectRequirement).where(eq(projectRequirement.projectId, projectId));

  const serviceRow = requirements.find((row) => row.requirementKey === 'service_key' && row.source === 'derived');
  const budgetRow = requirements.find((row) => row.requirementKey === 'budget_range' && row.source === 'derived');

  const serviceValue = serviceRow?.valueJson;
  const budgetValue = budgetRow?.valueJson as BudgetRange | undefined;

  return {
    postalCode: location?.postalCode ?? '',
    serviceKey: typeof serviceValue === 'string' ? serviceValue : null,
    budget: budgetValue ?? { known: false, minMinor: null, maxMinor: null },
  };
}

export async function loadMarketplaceIdForProject(db: Database | Tx, projectId: string): Promise<string> {
  const [row] = await db.select({ marketplaceId: project.marketplaceId }).from(project).where(eq(project.id, projectId)).limit(1);
  if (!row) throw new Error(`Project ${projectId} not found`);
  return row.marketplaceId;
}
