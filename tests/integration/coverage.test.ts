import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '@/modules/auth/session';
import type { Database } from '@/modules/database/client';
import {
  appUser,
  auditLog,
  providerAssignment,
  providerMarketplace,
  providerService,
  providerTeamMembership,
  providerTerritory,
  userRole,
} from '@/modules/database/schema';
import { DomainError } from '@/modules/errors';
import { submitProject } from '@/modules/intake/submit-project';
import { qualifyLead } from '@/modules/leads/commands';
import { assignProviders, rankProvidersForLead } from '@/modules/matching-engine/assign';
import { listCompanyCoverage, loadCoverage, updateCoverage } from '@/modules/provider/coverage';
import { createTestDatabase } from '../helpers/database';
import { makeIntake, publishRepoConfigs, seedOperator, seedProvider, type PublishedMarketplaces } from '../helpers/fixtures';

/**
 * Provider portal gate — "provider can update services and territories only
 * within allowed workflow" (docs/13-acceptance-criteria.md).
 *
 * Covers authorization, persistence and the effect on future matching. The
 * pure validation rules are in tests/unit/coverage.test.ts.
 */

let db: Database;
let published: PublishedMarketplaces;
let nordic: { companyId: string; ownerUserId: string };
let vapor: { companyId: string; ownerUserId: string };
let operatorId: string;

function session(overrides: Partial<Session> & { userId: string; providerCompanyIds: string[] }): Session {
  return { email: 'provider@example.com', name: 'Provider', roles: ['provider_owner'], ...overrides };
}

function ownerSession(company: { companyId: string; ownerUserId: string }): Session {
  return session({ userId: company.ownerUserId, providerCompanyIds: [company.companyId] });
}

/** A second user on the same company who is not the owner. */
async function seedMember(companyId: string, email: string): Promise<Session> {
  const [user] = await db.insert(appUser).values({ email, name: 'Member' }).returning({ id: appUser.id });
  await db.insert(providerTeamMembership).values({ providerCompanyId: companyId, userId: user!.id, role: 'provider_member' });
  await db.insert(userRole).values({ userId: user!.id, role: 'provider_member', providerCompanyId: companyId });
  return session({ userId: user!.id, providerCompanyIds: [companyId], roles: ['provider_member'] });
}

function update(company: string, input: Parameters<typeof updateCoverage>[1]['input'], as: Session) {
  return updateCoverage(db, {
    providerCompanyId: company,
    marketplaceId: published.id('suanas-mx'),
    config: published.config('suanas-mx'),
    input,
    session: as,
    correlationId: 'req_coverage',
  });
}

const VALID = { services: [{ serviceKey: 'infrared', minProjectValueMinor: 2_000_000 }], postalPrefixes: ['06'] };

async function expectDomainError(run: Promise<unknown>, code: string): Promise<void> {
  await expect(run).rejects.toBeInstanceOf(DomainError);
  await run.catch((error: DomainError) => expect(error.code).toBe(code));
}

/** A qualified lead in postal code 01000 asking for a traditional sauna. */
async function readyLead(postalCode = '01000', type = 'traditional') {
  const config = published.config('suanas-mx');
  const marketplaceId = published.id('suanas-mx');
  const outcome = await submitProject(db, {
    config,
    marketplaceId,
    input: makeIntake(config, { postalCode, answers: { type, budget: '100000_200000' } }),
    correlationId: 'req_test',
  });
  await qualifyLead(db, {
    leadId: outcome.leadId!,
    marketplaceId,
    actor: { type: 'operator', id: operatorId },
    correlationId: 'req_test',
  });
  return { leadId: outcome.leadId!, config, marketplaceId };
}

beforeEach(async () => {
  db = await createTestDatabase();
  published = await publishRepoConfigs(db);
  operatorId = await seedOperator(db);

  const marketplaceId = published.id('suanas-mx');
  nordic = await seedProvider(db, {
    name: 'Nordic',
    marketplaceId,
    services: ['traditional', 'infrared'],
    postalPrefixes: ['01', '03'],
    minValueMinor: 5_000_000,
    ownerEmail: 'nordic@example.com',
  });
  vapor = await seedProvider(db, {
    name: 'Vapor',
    marketplaceId,
    services: ['traditional'],
    postalPrefixes: ['01'],
    minValueMinor: 3_000_000,
    ownerEmail: 'vapor@example.com',
  });
});

describe('authorization', () => {
  it('lets the company owner replace its own coverage', async () => {
    const result = await update(nordic.companyId, VALID, ownerSession(nordic));
    expect(result.services.map((service) => service.serviceKey)).toEqual(['infrared']);
    expect(await loadCoverage(db, nordic.companyId, published.id('suanas-mx'))).toEqual(result);
  });

  it('refuses a provider member who is not the owner', async () => {
    const member = await seedMember(nordic.companyId, 'member.nordic@example.com');
    await expectDomainError(update(nordic.companyId, VALID, member), 'FORBIDDEN');
    // Unchanged.
    expect((await loadCoverage(db, nordic.companyId, published.id('suanas-mx'))).services).toHaveLength(2);
  });

  it('refuses an owner of a different company', async () => {
    await expectDomainError(update(nordic.companyId, VALID, ownerSession(vapor)), 'FORBIDDEN');
  });

  it('refuses a session that claims a company id it does not hold', async () => {
    // The session is the only source of company ids; a forged form value must not help.
    const forged = session({ userId: vapor.ownerUserId, providerCompanyIds: [vapor.companyId] });
    await expectDomainError(update(nordic.companyId, VALID, forged), 'FORBIDDEN');
  });

  it('refuses owner rights carried over from another company', async () => {
    // Owner of Vapor, mere member of Nordic: the flat role list says
    // "provider_owner", but the membership for Nordic must decide.
    const both = session({ userId: vapor.ownerUserId, providerCompanyIds: [vapor.companyId, nordic.companyId] });
    await db.insert(providerTeamMembership).values({
      providerCompanyId: nordic.companyId,
      userId: vapor.ownerUserId,
      role: 'provider_member',
    });
    await expectDomainError(update(nordic.companyId, VALID, both), 'FORBIDDEN');
  });

  it('refuses a company that does not participate in this marketplace', async () => {
    const pergolas = await seedProvider(db, {
      name: 'Solo Pergolas',
      marketplaceId: published.id('pergolas-mx'),
      services: ['aluminum'],
      postalPrefixes: ['01'],
      ownerEmail: 'solo.pergolas@example.com',
    });
    await expectDomainError(update(pergolas.companyId, VALID, ownerSession(pergolas)), 'PROVIDER_NOT_IN_MARKETPLACE');
  });

  it('refuses while the relationship is suspended', async () => {
    await db
      .update(providerMarketplace)
      .set({ status: 'suspended' })
      .where(
        and(
          eq(providerMarketplace.providerCompanyId, nordic.companyId),
          eq(providerMarketplace.marketplaceId, published.id('suanas-mx')),
        ),
      );
    await expectDomainError(update(nordic.companyId, VALID, ownerSession(nordic)), 'FORBIDDEN');
  });
});

describe('persistence', () => {
  it('replaces rather than accumulates, and is idempotent', async () => {
    await update(nordic.companyId, VALID, ownerSession(nordic));
    await update(nordic.companyId, VALID, ownerSession(nordic));

    const services = await db.select().from(providerService).where(eq(providerService.providerCompanyId, nordic.companyId));
    const territories = await db.select().from(providerTerritory).where(eq(providerTerritory.providerCompanyId, nordic.companyId));
    expect(services).toHaveLength(1);
    expect(territories).toHaveLength(1);
    expect(services[0]).toMatchObject({ serviceKey: 'infrared', minProjectValueMinor: 2_000_000, currency: 'MXN' });
  });

  it('writes an audit record with the previous and new coverage', async () => {
    await update(nordic.companyId, VALID, ownerSession(nordic));

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'provider.coverage_updated'));
    expect(entry).toMatchObject({
      actorType: 'provider_user',
      actorId: nordic.ownerUserId,
      entityType: 'provider_company',
      entityId: nordic.companyId,
      marketplaceId: published.id('suanas-mx'),
    });
    const metadata = entry!.metadataJson as { before: { postalPrefixes: string[] }; after: { postalPrefixes: string[] } };
    expect(metadata.before.postalPrefixes).toEqual(['01', '03']);
    expect(metadata.after.postalPrefixes).toEqual(['06']);
  });

  it('only touches the marketplace in scope', async () => {
    const pergolasId = published.id('pergolas-mx');
    await db.insert(providerMarketplace).values({ providerCompanyId: nordic.companyId, marketplaceId: pergolasId, status: 'approved' });
    await db.insert(providerService).values({
      providerCompanyId: nordic.companyId,
      marketplaceId: pergolasId,
      serviceKey: 'aluminum',
      minProjectValueMinor: 0,
      currency: 'MXN',
    });
    await db.insert(providerTerritory).values({ providerCompanyId: nordic.companyId, marketplaceId: pergolasId, postalPrefix: '44' });

    await update(nordic.companyId, VALID, ownerSession(nordic));

    const other = await loadCoverage(db, nordic.companyId, pergolasId);
    expect(other.services.map((service) => service.serviceKey)).toEqual(['aluminum']);
    expect(other.postalPrefixes).toEqual(['44']);
  });

  it('lists coverage only for the caller companies, flagging what they may edit', async () => {
    const member = await seedMember(nordic.companyId, 'reader.nordic@example.com');
    const rows = await listCompanyCoverage(db, member, published.id('suanas-mx'));
    expect(rows.map((row) => row.providerCompanyId)).toEqual([nordic.companyId]);
    expect(rows[0]!.editable).toBe(false);

    const owner = await listCompanyCoverage(db, ownerSession(nordic), published.id('suanas-mx'));
    expect(owner[0]!.editable).toBe(true);
    expect(owner[0]!.coverage.postalPrefixes).toEqual(['01', '03']);
  });
});

describe('effect on matching', () => {
  it('applies to the next lead and leaves existing assignments untouched', async () => {
    const first = await readyLead();
    const before = await rankProvidersForLead(db, first);
    expect(before.evaluations.filter((row) => row.eligible).map((row) => row.displayName).sort()).toEqual(['Nordic', 'Vapor']);

    const assigned = await assignProviders(db, {
      leadId: first.leadId,
      config: first.config,
      marketplaceId: first.marketplaceId,
      providerCompanyIds: [nordic.companyId],
      actor: { type: 'operator', id: operatorId },
      correlationId: 'req_assign',
    });
    expect(assigned.assignments).toHaveLength(1);

    // Nordic stops covering postal prefix 01 and drops the traditional service.
    await update(nordic.companyId, VALID, ownerSession(nordic));

    // The assignment that already exists is unaffected — history is not rewritten.
    const stored = await db.select().from(providerAssignment).where(eq(providerAssignment.leadId, first.leadId));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ providerCompanyId: nordic.companyId, status: 'assigned' });

    // A new lead in the same place no longer reaches Nordic.
    const second = await readyLead();
    const after = await rankProvidersForLead(db, second);
    expect(after.evaluations.filter((row) => row.eligible).map((row) => row.displayName)).toEqual(['Vapor']);

    const nordicAfter = after.evaluations.find((row) => row.displayName === 'Nordic')!;
    expect(nordicAfter.eligible).toBe(false);
    expect(nordicAfter.reasons.join(' ')).toContain('territory_matches_location');
  });

  it('cannot make a provider eligible for a service the marketplace does not offer', async () => {
    await expectDomainError(
      update(nordic.companyId, { services: [{ serviceKey: 'pool', minProjectValueMinor: 0 }], postalPrefixes: ['01'] }, ownerSession(nordic)),
      'INVALID_SERVICE',
    );
  });
});
