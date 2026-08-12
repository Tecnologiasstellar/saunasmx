import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  assignPlan,
  createPlan,
  endAgreement,
  listAgreementHistory,
  listPlans,
  listProviderAgreements,
  setPlanActive,
  updatePlanTerms,
} from '@/modules/commercial/agreements';
import type { Actor } from '@/modules/observability/audit';
import type { Database } from '@/modules/database/client';
import { auditLog, commissionAgreement, providerAgreement } from '@/modules/database/schema';
import { DomainError } from '@/modules/errors';
import { submitProject } from '@/modules/intake/submit-project';
import { qualifyLead } from '@/modules/leads/commands';
import { rankProvidersForLead } from '@/modules/matching-engine/assign';
import { createTestDatabase } from '../helpers/database';
import { makeIntake, publishRepoConfigs, seedOperator, seedProvider, type PublishedMarketplaces } from '../helpers/fixtures';

/**
 * Commercial gate — COM-001, plans and agreements
 * (docs/07-billing-and-economics.md, docs/13-acceptance-criteria.md).
 *
 * The criterion under test is "terms are stored on the provider-marketplace
 * agreement": a snapshot that survives every later edit to the plan.
 */

let db: Database;
let published: PublishedMarketplaces;
let nordic: { companyId: string; ownerUserId: string };
let vapor: { companyId: string; ownerUserId: string };
let operatorId: string;
let actor: Actor;

const PILOT = { currency: 'MXN' };
const GROWTH = { currency: 'MXN', qualifiedLeadFeeMinor: 25_000, successCommissionBps: 300 };

function suanas() {
  return published.id('suanas-mx');
}

async function newPlan(name: string, terms: unknown, marketplaceId = suanas()) {
  const { planId } = await createPlan(db, { marketplaceId, name, terms, actor, correlationId: 'req_plan' });
  return planId;
}

async function expectDomainError(run: Promise<unknown>, code: string): Promise<void> {
  await expect(run).rejects.toBeInstanceOf(DomainError);
  await run.catch((error: DomainError) => expect(error.code).toBe(code));
}

beforeEach(async () => {
  db = await createTestDatabase();
  published = await publishRepoConfigs(db);
  operatorId = await seedOperator(db);
  actor = { type: 'operator', id: operatorId };

  nordic = await seedProvider(db, {
    name: 'Nordic',
    marketplaceId: suanas(),
    services: ['traditional'],
    postalPrefixes: ['01'],
    ownerEmail: 'nordic@example.com',
  });
  vapor = await seedProvider(db, {
    name: 'Vapor',
    marketplaceId: suanas(),
    services: ['traditional'],
    postalPrefixes: ['01'],
    ownerEmail: 'vapor@example.com',
  });
});

describe('plans', () => {
  it('stores validated, normalized terms', async () => {
    await newPlan('Piloto', PILOT);
    const [plan] = await listPlans(db, suanas());
    expect(plan).toMatchObject({ name: 'Piloto', active: true });
    // Every primitive is present and zeroed, so no consumer has to guess.
    expect(plan!.terms.successCommissionBps).toBe(0);
    expect(plan!.terms.currency).toBe('MXN');
  });

  it('refuses invalid terms before anything is written', async () => {
    await expectDomainError(newPlan('Malo', { currency: 'MXN', successCommissionBps: 20_000 }), 'INVALID_TERMS');
    expect(await listPlans(db, suanas())).toHaveLength(0);
  });

  it('refuses a nameless plan', async () => {
    await expectDomainError(newPlan('   ', PILOT), 'INVALID_PLAN_NAME');
  });

  it('will not touch a plan belonging to another marketplace', async () => {
    const foreign = await newPlan('Pérgolas', PILOT, published.id('pergolas-mx'));
    await expectDomainError(
      updatePlanTerms(db, { planId: foreign, marketplaceId: suanas(), terms: GROWTH, actor, correlationId: 'req' }),
      'PLAN_NOT_FOUND',
    );
  });
});

describe('terms snapshot', () => {
  it('copies the plan terms onto the agreement', async () => {
    const planId = await newPlan('Crecimiento', GROWTH);
    await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' });

    const [row] = await listProviderAgreements(db, suanas());
    expect(row!.terms).toMatchObject({ qualifiedLeadFeeMinor: 25_000, successCommissionBps: 300 });
  });

  it('survives a later edit to the plan — the whole point of the snapshot', async () => {
    const planId = await newPlan('Crecimiento', GROWTH);
    await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' });

    await updatePlanTerms(db, {
      planId,
      marketplaceId: suanas(),
      terms: { currency: 'MXN', qualifiedLeadFeeMinor: 99_000, successCommissionBps: 1_500 },
      actor,
      correlationId: 'req',
    });

    const [row] = await listProviderAgreements(db, suanas());
    expect(row!.terms).toMatchObject({ qualifiedLeadFeeMinor: 25_000, successCommissionBps: 300 });

    const [plan] = await listPlans(db, suanas());
    expect(plan!.terms.qualifiedLeadFeeMinor).toBe(99_000);
  });

  it('survives the plan being retired', async () => {
    const planId = await newPlan('Crecimiento', GROWTH);
    await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' });
    await setPlanActive(db, { planId, marketplaceId: suanas(), active: false, actor, correlationId: 'req' });

    const [row] = await listProviderAgreements(db, suanas());
    expect(row!.terms).toMatchObject({ qualifiedLeadFeeMinor: 25_000 });
  });

  it('derives commission agreements with their own snapshot', async () => {
    const planId = await newPlan('Crecimiento', GROWTH);
    const { agreementId } = await assignPlan(db, {
      providerCompanyId: nordic.companyId,
      marketplaceId: suanas(),
      planId,
      actor,
      correlationId: 'req',
    });

    const rows = await db.select().from(commissionAgreement).where(eq(commissionAgreement.providerAgreementId, agreementId));
    expect(rows.map((row) => row.trigger).sort()).toEqual(['qualified_lead', 'verified_win']);
    expect(rows.find((row) => row.trigger === 'verified_win')).toMatchObject({ rateBps: 300, fixedFeeMinor: null });
    expect(rows.find((row) => row.trigger === 'qualified_lead')!.termsSnapshotJson).toMatchObject({ currency: 'MXN' });
  });

  it('creates no commission agreement for a plan that charges nothing', async () => {
    const planId = await newPlan('Piloto', PILOT);
    const { agreementId } = await assignPlan(db, {
      providerCompanyId: nordic.companyId,
      marketplaceId: suanas(),
      planId,
      actor,
      correlationId: 'req',
    });
    expect(await db.select().from(commissionAgreement).where(eq(commissionAgreement.providerAgreementId, agreementId))).toHaveLength(0);
  });
});

describe('agreement lifecycle', () => {
  it('is idempotent when nothing has moved', async () => {
    const planId = await newPlan('Piloto', PILOT);
    const first = await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' });
    const second = await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' });

    expect(second).toEqual({ agreementId: first.agreementId, changed: false });
    expect(await listAgreementHistory(db, nordic.companyId, suanas())).toHaveLength(1);
  });

  it('opens a new agreement when the plan terms have moved underneath', async () => {
    const planId = await newPlan('Piloto', PILOT);
    await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' });
    await updatePlanTerms(db, { planId, marketplaceId: suanas(), terms: GROWTH, actor, correlationId: 'req' });

    const second = await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' });
    expect(second.changed).toBe(true);

    const history = await listAgreementHistory(db, nordic.companyId, suanas());
    expect(history).toHaveLength(2);
    expect(history[0]!.endsAt).toBeNull();
    expect(history[1]!.endsAt).not.toBeNull();
  });

  it('closes the superseded agreement instead of deleting it', async () => {
    const pilot = await newPlan('Piloto', PILOT);
    const growth = await newPlan('Crecimiento', GROWTH);
    await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId: pilot, actor, correlationId: 'req' });
    await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId: growth, actor, correlationId: 'req' });

    const history = await listAgreementHistory(db, nordic.companyId, suanas());
    expect(history).toHaveLength(2);
    // The old terms are still readable, which is what a past commission event needs.
    expect(history[1]!.terms.qualifiedLeadFeeMinor).toBe(0);
    expect(history[0]!.terms.qualifiedLeadFeeMinor).toBe(25_000);
    expect(await listProviderAgreements(db, suanas())).toHaveLength(2);
  });

  it('refuses to assign a retired plan', async () => {
    const planId = await newPlan('Piloto', PILOT);
    await setPlanActive(db, { planId, marketplaceId: suanas(), active: false, actor, correlationId: 'req' });
    await expectDomainError(
      assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' }),
      'PLAN_INACTIVE',
    );
  });

  it('refuses a plan from another marketplace', async () => {
    const foreign = await newPlan('Pérgolas', GROWTH, published.id('pergolas-mx'));
    await expectDomainError(
      assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId: foreign, actor, correlationId: 'req' }),
      'PLAN_NOT_FOUND',
    );
  });

  it('refuses a company that does not participate in this marketplace', async () => {
    const planId = await newPlan('Piloto', PILOT);
    const outsider = await seedProvider(db, {
      name: 'Solo Pergolas',
      marketplaceId: published.id('pergolas-mx'),
      ownerEmail: 'solo@example.com',
    });
    await expectDomainError(
      assignPlan(db, { providerCompanyId: outsider.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' }),
      'PROVIDER_NOT_IN_MARKETPLACE',
    );
  });

  it('ends an agreement without erasing it', async () => {
    const planId = await newPlan('Piloto', PILOT);
    await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' });
    const ended = await endAgreement(db, {
      providerCompanyId: nordic.companyId,
      marketplaceId: suanas(),
      reason: 'provider_left',
      actor,
      correlationId: 'req',
    });

    expect(ended.changed).toBe(true);
    expect(await listAgreementHistory(db, nordic.companyId, suanas())).toHaveLength(1);
    const row = (await listProviderAgreements(db, suanas())).find((entry) => entry.providerCompanyId === nordic.companyId);
    expect(row!.terms).toBeNull();

    // Idempotent: there is nothing left to end.
    expect(await endAgreement(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), reason: 'again', actor, correlationId: 'req' })).toEqual({
      changed: false,
    });
  });

  it('keeps agreements separate per marketplace for one company', async () => {
    const both = await seedProvider(db, { name: 'Grupo', marketplaceId: suanas(), ownerEmail: 'grupo@example.com' });
    await seedProvider(db, { name: 'Grupo GDL', marketplaceId: published.id('pergolas-mx'), ownerEmail: 'grupo.gdl@example.com' });
    // Re-use the same company in the second marketplace.
    const pergolasId = published.id('pergolas-mx');
    await db.insert((await import('@/modules/database/schema')).providerMarketplace).values({
      providerCompanyId: both.companyId,
      marketplaceId: pergolasId,
      status: 'approved',
    });

    const suanasPlan = await newPlan('Piloto', PILOT);
    const pergolasPlan = await newPlan('Pérgolas premium', GROWTH, pergolasId);
    await assignPlan(db, { providerCompanyId: both.companyId, marketplaceId: suanas(), planId: suanasPlan, actor, correlationId: 'req' });
    await assignPlan(db, { providerCompanyId: both.companyId, marketplaceId: pergolasId, planId: pergolasPlan, actor, correlationId: 'req' });

    const inSuanas = await listAgreementHistory(db, both.companyId, suanas());
    const inPergolas = await listAgreementHistory(db, both.companyId, pergolasId);
    expect(inSuanas).toHaveLength(1);
    expect(inPergolas).toHaveLength(1);
    expect(inSuanas[0]!.terms.qualifiedLeadFeeMinor).toBe(0);
    expect(inPergolas[0]!.terms.qualifiedLeadFeeMinor).toBe(25_000);
  });
});

describe('audit', () => {
  it('records plan creation, term edits and each agreement', async () => {
    const planId = await newPlan('Piloto', PILOT);
    await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' });
    await updatePlanTerms(db, { planId, marketplaceId: suanas(), terms: GROWTH, actor, correlationId: 'req' });

    const actions = (await db.select().from(auditLog)).map((entry) => entry.action);
    expect(actions).toContain('commercial_plan.created');
    expect(actions).toContain('commercial_plan.terms_updated');
    expect(actions).toContain('provider_agreement.created');

    const [edit] = await db.select().from(auditLog).where(eq(auditLog.action, 'commercial_plan.terms_updated'));
    const metadata = edit!.metadataJson as { before: { qualifiedLeadFeeMinor: number }; after: { qualifiedLeadFeeMinor: number } };
    expect(metadata.before.qualifiedLeadFeeMinor).toBe(0);
    expect(metadata.after.qualifiedLeadFeeMinor).toBe(25_000);
  });
});

describe('provider trust', () => {
  it('does not let a paid plan buy eligibility or ranking', async () => {
    // docs/07: sponsorship may affect disclosed placement; eligibility, quality
    // and consumer fit are protected. The matching engine never reads terms.
    const config = published.config('suanas-mx');
    const outcome = await submitProject(db, {
      config,
      marketplaceId: suanas(),
      input: makeIntake(config, { postalCode: '01000', answers: { type: 'traditional', budget: '100000_150000' } }),
      correlationId: 'req_test',
    });
    await qualifyLead(db, { leadId: outcome.leadId!, marketplaceId: suanas(), actor, correlationId: 'req_test' });

    const before = await rankProvidersForLead(db, { leadId: outcome.leadId!, config, marketplaceId: suanas() });

    const premium = await newPlan('Premium destacado', {
      currency: 'MXN',
      monthlySubscriptionMinor: 500_000,
      featuredPlacement: true,
      successCommissionBps: 1_000,
    });
    await assignPlan(db, { providerCompanyId: vapor.companyId, marketplaceId: suanas(), planId: premium, actor, correlationId: 'req' });

    const after = await rankProvidersForLead(db, { leadId: outcome.leadId!, config, marketplaceId: suanas() });
    expect(after.evaluations.map((row) => [row.displayName, row.score, row.eligible])).toEqual(
      before.evaluations.map((row) => [row.displayName, row.score, row.eligible]),
    );
  });
});

describe('read models', () => {
  it('lists every provider in the marketplace, with or without an agreement', async () => {
    const planId = await newPlan('Piloto', PILOT);
    await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' });

    const rows = await listProviderAgreements(db, suanas());
    expect(rows.map((row) => row.displayName)).toEqual(['Nordic', 'Vapor']);
    expect(rows.find((row) => row.displayName === 'Nordic')!.planName).toBe('Piloto');
    expect(rows.find((row) => row.displayName === 'Vapor')!.agreementId).toBeNull();
  });

  it('does not leak another marketplace plans', async () => {
    await newPlan('Pérgolas', PILOT, published.id('pergolas-mx'));
    expect(await listPlans(db, suanas())).toHaveLength(0);
  });
});

describe('stored rows', () => {
  it('never mutates the terms of an agreement row once written', async () => {
    const planId = await newPlan('Piloto', PILOT);
    const { agreementId } = await assignPlan(db, {
      providerCompanyId: nordic.companyId,
      marketplaceId: suanas(),
      planId,
      actor,
      correlationId: 'req',
    });
    const [original] = await db.select().from(providerAgreement).where(eq(providerAgreement.id, agreementId));

    await updatePlanTerms(db, { planId, marketplaceId: suanas(), terms: GROWTH, actor, correlationId: 'req' });
    await assignPlan(db, { providerCompanyId: nordic.companyId, marketplaceId: suanas(), planId, actor, correlationId: 'req' });

    const [after] = await db.select().from(providerAgreement).where(eq(providerAgreement.id, agreementId));
    expect(after!.termsSnapshotJson).toEqual(original!.termsSnapshotJson);
    expect(after!.planId).toBe(original!.planId);
    // Only `ends_at` moves when an agreement is superseded.
    expect(after!.endsAt).not.toBeNull();
  });
});
