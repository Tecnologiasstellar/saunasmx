import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Session } from '../auth/session';
import type { Database, Tx } from '../database/client';
import {
  providerCompany,
  providerMarketplace,
  providerService,
  providerTeamMembership,
  providerTerritory,
} from '../database/schema';
import { DomainError, ERROR_CODES } from '../errors';
import { isUnspecified } from '../matching-engine/evaluate';
import type { MarketplaceConfig, QuestionnaireOption } from '../marketplace-config/types';
import { recordAudit } from '../observability/audit';

/**
 * Provider self-service coverage: the services a company offers in one
 * marketplace, the minimum project value it will take for each, and the postal
 * prefixes it travels to.
 *
 * Coverage is the provider's half of the deterministic eligibility rules
 * (ADR-005), so it is edited under the same guarantees as the rest of the
 * portal: company-scoped authorization, owner-only writes, values validated
 * against the marketplace's own configuration, and an audit record per change.
 *
 * Editing coverage never touches existing assignments. Matching reads coverage
 * at routing time, so a change applies to future leads only and cannot rewrite
 * a stored match explanation.
 */

/** A single digit would silently claim a tenth of the country, so prefixes start at two. */
const POSTAL_PREFIX = /^\d{2,5}$/;
const MAX_POSTAL_PREFIXES = 50;

/** A rejected or suspended provider is under review; it may not widen its own reach. */
const EDITABLE_STATUSES = ['pending', 'approved', 'paused'];

export type CoverageService = { serviceKey: string; minProjectValueMinor: number };
export type Coverage = { services: CoverageService[]; postalPrefixes: string[] };

/** What a provider proposes. Untrusted until `parseCoverage` has run over it. */
export type CoverageInput = {
  services: CoverageService[];
  postalPrefixes: string[];
};

/**
 * The service keys a provider may claim in this marketplace: the options of the
 * questionnaire step that supplies the matching `service` dimension. Keeping
 * the vocabulary in configuration is what lets a new category launch without
 * touching this module (ADR-006).
 */
export function allowedServiceOptions(config: MarketplaceConfig): QuestionnaireOption[] {
  const step = config.questionnaire.steps.find((candidate) => candidate.id === config.matching.answerMapping.service);
  if (!step || !('options' in step)) return [];
  return step.options.filter((option) => !isUnspecified(option.value));
}

export function allowedServiceKeys(config: MarketplaceConfig): string[] {
  return allowedServiceOptions(config).map((option) => option.value);
}

/**
 * Validates and normalizes a proposed coverage set. Pure, so the rules are
 * unit-testable without a database and produce the same result at every layer.
 */
export function parseCoverage(config: MarketplaceConfig, input: CoverageInput): Coverage {
  const allowed = new Set(allowedServiceKeys(config));
  const services = new Map<string, CoverageService>();

  for (const entry of input.services) {
    const serviceKey = entry.serviceKey.trim();
    if (!allowed.has(serviceKey)) {
      throw new DomainError('INVALID_SERVICE', `"${serviceKey}" is not a service offered by this marketplace.`, 422);
    }
    if (!Number.isInteger(entry.minProjectValueMinor) || entry.minProjectValueMinor < 0) {
      throw new DomainError(
        'INVALID_AMOUNT',
        'The minimum project value must be a whole number of cents, zero or more.',
        422,
      );
    }
    // Last entry wins rather than erroring: a duplicated checkbox is not the
    // provider's mistake to be punished for.
    services.set(serviceKey, { serviceKey, minProjectValueMinor: entry.minProjectValueMinor });
  }

  const postalPrefixes: string[] = [];
  for (const raw of input.postalPrefixes) {
    const prefix = raw.trim();
    if (prefix === '') continue;
    if (!POSTAL_PREFIX.test(prefix)) {
      throw new DomainError('INVALID_TERRITORY', `"${prefix}" is not a valid postal prefix: use 2 to 5 digits.`, 422);
    }
    if (!postalPrefixes.includes(prefix)) postalPrefixes.push(prefix);
  }

  // An empty set would silently stop every future lead. Pausing is a capacity
  // decision an operator records, not a side effect of clearing a form.
  if (services.size === 0) {
    throw new DomainError('COVERAGE_EMPTY', 'Select at least one service you offer.', 422);
  }
  if (postalPrefixes.length === 0) {
    throw new DomainError('COVERAGE_EMPTY', 'Add at least one postal prefix you travel to.', 422);
  }
  if (postalPrefixes.length > MAX_POSTAL_PREFIXES) {
    throw new DomainError('COVERAGE_TOO_BROAD', `Use at most ${MAX_POSTAL_PREFIXES} postal prefixes.`, 422);
  }

  // Sorted so stored rows and audit metadata are stable across submissions.
  return {
    services: [...services.values()].sort((a, b) => a.serviceKey.localeCompare(b.serviceKey)),
    postalPrefixes: postalPrefixes.sort(),
  };
}

export async function loadCoverage(
  db: Database | Tx,
  providerCompanyId: string,
  marketplaceId: string,
): Promise<Coverage> {
  const services = await db
    .select({ serviceKey: providerService.serviceKey, minProjectValueMinor: providerService.minProjectValueMinor })
    .from(providerService)
    .where(
      and(
        eq(providerService.providerCompanyId, providerCompanyId),
        eq(providerService.marketplaceId, marketplaceId),
      ),
    )
    .orderBy(asc(providerService.serviceKey));

  const territories = await db
    .select({ postalPrefix: providerTerritory.postalPrefix })
    .from(providerTerritory)
    .where(
      and(
        eq(providerTerritory.providerCompanyId, providerCompanyId),
        eq(providerTerritory.marketplaceId, marketplaceId),
      ),
    )
    .orderBy(asc(providerTerritory.postalPrefix));

  return { services, postalPrefixes: territories.map((row) => row.postalPrefix) };
}

/** Companies where this user is the owner. Read from memberships, not from the session's flat role list. */
export async function ownedCompanyIds(db: Database | Tx, userId: string): Promise<string[]> {
  const rows = await db
    .select({ providerCompanyId: providerTeamMembership.providerCompanyId })
    .from(providerTeamMembership)
    .where(and(eq(providerTeamMembership.userId, userId), eq(providerTeamMembership.role, 'provider_owner')));
  return rows.map((row) => row.providerCompanyId);
}

export type CompanyCoverage = {
  providerCompanyId: string;
  displayName: string;
  /** Provider-marketplace relationship status. */
  status: string;
  editable: boolean;
  coverage: Coverage;
};

/**
 * Coverage for every company the caller may act for that participates in this
 * marketplace. Company ids come from the session, never from the request.
 */
export async function listCompanyCoverage(
  db: Database,
  session: Session,
  marketplaceId: string,
): Promise<CompanyCoverage[]> {
  if (session.providerCompanyIds.length === 0) return [];

  const relationships = await db
    .select({
      providerCompanyId: providerMarketplace.providerCompanyId,
      status: providerMarketplace.status,
      displayName: providerCompany.displayName,
    })
    .from(providerMarketplace)
    .innerJoin(providerCompany, eq(providerCompany.id, providerMarketplace.providerCompanyId))
    .where(
      and(
        inArray(providerMarketplace.providerCompanyId, session.providerCompanyIds),
        eq(providerMarketplace.marketplaceId, marketplaceId),
        isNull(providerMarketplace.deletedAt),
        isNull(providerCompany.deletedAt),
      ),
    )
    .orderBy(asc(providerCompany.displayName));

  const owned = new Set(session.roles.includes('admin') ? session.providerCompanyIds : await ownedCompanyIds(db, session.userId));

  return Promise.all(
    relationships.map(async (relationship) => ({
      providerCompanyId: relationship.providerCompanyId,
      displayName: relationship.displayName,
      status: relationship.status,
      editable: owned.has(relationship.providerCompanyId) && EDITABLE_STATUSES.includes(relationship.status),
      coverage: await loadCoverage(db, relationship.providerCompanyId, marketplaceId),
    })),
  );
}

async function requireCompanyOwner(tx: Tx, session: Session, providerCompanyId: string): Promise<void> {
  if (!session.providerCompanyIds.includes(providerCompanyId)) {
    throw new DomainError(ERROR_CODES.FORBIDDEN, 'You do not have access to this company.', 403);
  }
  if (session.roles.includes('admin')) return;
  // Checked against this company's membership rather than the session's flat
  // role list: owning one company must not grant owner rights over another.
  const owned = await ownedCompanyIds(tx, session.userId);
  if (!owned.includes(providerCompanyId)) {
    throw new DomainError(ERROR_CODES.FORBIDDEN, 'Only a provider owner can change coverage.', 403);
  }
}

/**
 * Replaces a company's coverage in one marketplace. Replace-set rather than
 * incremental edits, so a repeated submission is a no-op and the stored rows
 * always equal what the provider last saw.
 */
export async function updateCoverage(
  db: Database,
  args: {
    providerCompanyId: string;
    marketplaceId: string;
    config: MarketplaceConfig;
    input: CoverageInput;
    session: Session;
    correlationId: string;
  },
): Promise<Coverage> {
  // Validated before the transaction opens: a bad form should not hold a lock.
  const next = parseCoverage(args.config, args.input);

  return db.transaction(async (tx) => {
    await requireCompanyOwner(tx, args.session, args.providerCompanyId);

    const [relationship] = await tx
      .select({ status: providerMarketplace.status })
      .from(providerMarketplace)
      .where(
        and(
          eq(providerMarketplace.providerCompanyId, args.providerCompanyId),
          eq(providerMarketplace.marketplaceId, args.marketplaceId),
          isNull(providerMarketplace.deletedAt),
        ),
      )
      .limit(1);

    if (!relationship) {
      throw new DomainError(
        'PROVIDER_NOT_IN_MARKETPLACE',
        'This company does not participate in this marketplace.',
        404,
      );
    }
    if (!EDITABLE_STATUSES.includes(relationship.status)) {
      throw new DomainError(
        ERROR_CODES.FORBIDDEN,
        'Coverage cannot be changed while the account is under review.',
        403,
      );
    }

    const previous = await loadCoverage(tx, args.providerCompanyId, args.marketplaceId);

    const scope = (table: typeof providerService | typeof providerTerritory) =>
      and(eq(table.providerCompanyId, args.providerCompanyId), eq(table.marketplaceId, args.marketplaceId));

    await tx.delete(providerService).where(scope(providerService));
    await tx.delete(providerTerritory).where(scope(providerTerritory));

    await tx.insert(providerService).values(
      next.services.map((service) => ({
        providerCompanyId: args.providerCompanyId,
        marketplaceId: args.marketplaceId,
        serviceKey: service.serviceKey,
        minProjectValueMinor: service.minProjectValueMinor,
        currency: args.config.localization.currency,
      })),
    );

    await tx.insert(providerTerritory).values(
      next.postalPrefixes.map((postalPrefix) => ({
        providerCompanyId: args.providerCompanyId,
        marketplaceId: args.marketplaceId,
        postalPrefix,
      })),
    );

    await recordAudit(tx, {
      actor: { type: 'provider_user', id: args.session.userId },
      action: 'provider.coverage_updated',
      entityType: 'provider_company',
      entityId: args.providerCompanyId,
      marketplaceId: args.marketplaceId,
      metadata: { correlationId: args.correlationId, before: previous, after: next },
    });

    return next;
  });
}
