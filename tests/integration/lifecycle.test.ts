import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@/modules/database/client';
import {
  auditLog,
  communication,
  consentRecord,
  lead,
  leadStatusHistory,
  matchExplanation,
  outboxEvent,
  project,
  projectOutcome,
  providerAssignment,
  quote,
} from '@/modules/database/schema';
import type { Session } from '@/modules/auth/session';
import { qualifyLead } from '@/modules/leads/commands';
import { assignProviders, rankProvidersForLead } from '@/modules/matching-engine/assign';
import { acceptAssignment, recordOutcome, rejectAssignment, submitQuote } from '@/modules/provider/commands';
import { getAssignmentDetail, listAssignments } from '@/modules/provider/queries';
import { submitProject } from '@/modules/intake/submit-project';
import { FakeEmailProvider, setEmailProvider } from '@/modules/messaging/email';
import { processOutbox } from '@/modules/worker/outbox-worker';
import { createTestDatabase } from '../helpers/database';
import { makeIntake, publishRepoConfigs, seedOperator, seedProvider, type PublishedMarketplaces } from '../helpers/fixtures';

/**
 * Matching gate and provider portal gate — docs/13-acceptance-criteria.md.
 */

let db: Database;
let published: PublishedMarketplaces;
let email: FakeEmailProvider;
let nordic: { companyId: string; ownerUserId: string };
let vapor: { companyId: string; ownerUserId: string };
let outsider: { companyId: string; ownerUserId: string };
let operatorId: string;

function ownerSession(company: { companyId: string; ownerUserId: string }, roles: Session['roles'] = ['provider_owner']): Session {
  return {
    userId: company.ownerUserId,
    email: 'owner@example.com',
    name: 'Owner',
    roles,
    providerCompanyIds: [company.companyId],
  };
}

async function readyLead(overrides: Parameters<typeof makeIntake>[1] = {}) {
  const config = published.config('suanas-mx');
  const marketplaceId = published.id('suanas-mx');
  const outcome = await submitProject(db, {
    config,
    marketplaceId,
    input: makeIntake(config, { answers: { type: 'traditional', budget: '100000_150000' }, ...overrides }),
    correlationId: 'req_test',
  });
  await qualifyLead(db, {
    leadId: outcome.leadId!,
    marketplaceId,
    actor: { type: 'operator', id: operatorId },
    correlationId: 'req_test',
  });
  return { ...outcome, config, marketplaceId, leadId: outcome.leadId! };
}

beforeEach(async () => {
  db = await createTestDatabase();
  published = await publishRepoConfigs(db);
  email = new FakeEmailProvider();
  setEmailProvider(email);

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
  outsider = await seedProvider(db, {
    name: 'Outsider',
    marketplaceId,
    services: ['traditional'],
    postalPrefixes: ['01'],
    ownerEmail: 'outsider@example.com',
  });
});

describe('operator qualification', () => {
  it('moves the lead to ready_for_matching and records who did it', async () => {
    const { leadId } = await readyLead();
    const [leadRow] = await db.select().from(lead).where(eq(lead.id, leadId));
    expect(leadRow?.lifecycleStatus).toBe('ready_for_matching');
    expect(leadRow?.qualificationStatus).toBe('qualified');

    const history = await db.select().from(leadStatusHistory).where(eq(leadStatusHistory.leadId, leadId));
    expect(history.at(-1)).toMatchObject({ toStatus: 'ready_for_matching', actorType: 'operator' });
  });

  it('is idempotent', async () => {
    const { leadId, marketplaceId } = await readyLead();
    const second = await qualifyLead(db, {
      leadId,
      marketplaceId,
      actor: { type: 'operator', id: operatorId },
      correlationId: 'req_2',
    });
    expect(second.changed).toBe(false);
  });
});

describe('assignment', () => {
  it('stores a reproducible explanation for every assignment', async () => {
    const { leadId, config, marketplaceId } = await readyLead();
    const result = await assignProviders(db, {
      leadId,
      config,
      marketplaceId,
      providerCompanyIds: [nordic.companyId],
      actor: { type: 'operator', id: operatorId },
      correlationId: 'req_test',
    });

    const [explanation] = await db
      .select()
      .from(matchExplanation)
      .where(eq(matchExplanation.assignmentId, result.assignments[0]!.assignmentId));

    expect(explanation?.ruleVersion).toContain('matching-v1');
    expect(Array.isArray(explanation?.eligibilityJson)).toBe(true);
    expect(Array.isArray(explanation?.scoreBreakdownJson)).toBe(true);

    // Ranking the same lead twice produces the same scores.
    const first = await rankProvidersForLead(db, { leadId, config, marketplaceId });
    const again = await rankProvidersForLead(db, { leadId, config, marketplaceId });
    expect(first.evaluations.map((e) => [e.providerCompanyId, e.score])).toEqual(
      again.evaluations.map((e) => [e.providerCompanyId, e.score]),
    );
  });

  it('enforces the distribution maximum across separate calls', async () => {
    const { leadId, config, marketplaceId } = await readyLead();
    await assignProviders(db, {
      leadId,
      config,
      marketplaceId,
      providerCompanyIds: [nordic.companyId, vapor.companyId],
      actor: { type: 'operator', id: operatorId },
      correlationId: 'req_1',
    });

    await expect(
      assignProviders(db, {
        leadId,
        config,
        marketplaceId,
        providerCompanyIds: [outsider.companyId],
        actor: { type: 'operator', id: operatorId },
        correlationId: 'req_2',
      }),
    ).rejects.toMatchObject({ code: 'DISTRIBUTION_LIMIT_EXCEEDED' });

    expect(await db.select().from(providerAssignment).where(eq(providerAssignment.leadId, leadId))).toHaveLength(2);
  });

  it('refuses to route to an ineligible provider even when an operator asks', async () => {
    const marketplaceId = published.id('suanas-mx');
    const faraway = await seedProvider(db, {
      name: 'Faraway',
      marketplaceId,
      services: ['traditional'],
      postalPrefixes: ['99'],
      ownerEmail: 'faraway@example.com',
    });
    const { leadId, config } = await readyLead();

    await expect(
      assignProviders(db, {
        leadId,
        config,
        marketplaceId,
        providerCompanyIds: [faraway.companyId],
        actor: { type: 'operator', id: operatorId },
        correlationId: 'req_test',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_ELIGIBLE' });
  });

  it('refuses to share a project that has no provider-sharing consent', async () => {
    const { leadId, config, marketplaceId, projectId } = await readyLead();
    await db
      .update(consentRecord)
      .set({ granted: false })
      .where(eq(consentRecord.projectId, projectId));

    await expect(
      assignProviders(db, {
        leadId,
        config,
        marketplaceId,
        providerCompanyIds: [nordic.companyId],
        actor: { type: 'operator', id: operatorId },
        correlationId: 'req_test',
      }),
    ).rejects.toMatchObject({ code: 'CONSENT_MISSING' });

    expect(await db.select().from(providerAssignment)).toHaveLength(0);
  });

  it('is idempotent when the same provider is assigned twice', async () => {
    const { leadId, config, marketplaceId } = await readyLead();
    const args = {
      leadId,
      config,
      marketplaceId,
      providerCompanyIds: [nordic.companyId],
      actor: { type: 'operator' as const, id: operatorId },
      correlationId: 'req_test',
    };
    await assignProviders(db, args);
    const second = await assignProviders(db, args);

    expect(second.assignments).toHaveLength(0);
    expect(second.alreadyAssigned).toEqual([nordic.companyId]);
    expect(await db.select().from(providerAssignment).where(eq(providerAssignment.leadId, leadId))).toHaveLength(1);
  });

  it('records the operator override as an auditable action', async () => {
    const { leadId, config, marketplaceId } = await readyLead();
    await assignProviders(db, {
      leadId,
      config,
      marketplaceId,
      providerCompanyIds: [nordic.companyId],
      actor: { type: 'operator', id: operatorId },
      correlationId: 'req_test',
    });

    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, leadId));
    expect(entries.some((entry) => entry.action === 'lead.assigned' && entry.actorType === 'operator')).toBe(true);
  });

  it('moves the project to matched and the lead to assigned', async () => {
    const { leadId, projectId, config, marketplaceId } = await readyLead();
    await assignProviders(db, {
      leadId,
      config,
      marketplaceId,
      providerCompanyIds: [nordic.companyId],
      actor: { type: 'operator', id: operatorId },
      correlationId: 'req_test',
    });

    const [leadRow] = await db.select().from(lead).where(eq(lead.id, leadId));
    const [projectRow] = await db.select().from(project).where(eq(project.id, projectId));
    expect(leadRow?.lifecycleStatus).toBe('assigned');
    expect(projectRow?.status).toBe('matched');
  });
});

describe('provider portal authorization', () => {
  async function assignedTo(company: { companyId: string; ownerUserId: string }) {
    const { leadId, config, marketplaceId } = await readyLead();
    const result = await assignProviders(db, {
      leadId,
      config,
      marketplaceId,
      providerCompanyIds: [company.companyId],
      actor: { type: 'operator', id: operatorId },
      correlationId: 'req_test',
    });
    return { assignmentId: result.assignments[0]!.assignmentId, marketplaceId, leadId };
  }

  it('shows a provider only its own assignments', async () => {
    const { marketplaceId } = await assignedTo(nordic);
    const mine = await listAssignments(db, [nordic.companyId], marketplaceId);
    const theirs = await listAssignments(db, [outsider.companyId], marketplaceId);
    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(0);
  });

  it('does not reveal another company assignment by id', async () => {
    const { assignmentId, marketplaceId } = await assignedTo(nordic);
    const detail = await getAssignmentDetail(db, assignmentId, [outsider.companyId], marketplaceId);
    expect(detail).toBeNull();
  });

  it('rejects a command from a company that does not own the assignment', async () => {
    const { assignmentId } = await assignedTo(nordic);
    await expect(
      acceptAssignment(db, { assignmentId, session: ownerSession(outsider), correlationId: 'req_test' }),
    ).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
  });

  it('withholds consumer contact details until the assignment is accepted', async () => {
    const { assignmentId, marketplaceId } = await assignedTo(nordic);

    const before = await getAssignmentDetail(db, assignmentId, [nordic.companyId], marketplaceId);
    expect(before?.contact).toBeNull();

    await acceptAssignment(db, { assignmentId, session: ownerSession(nordic), correlationId: 'req_test' });

    const after = await getAssignmentDetail(db, assignmentId, [nordic.companyId], marketplaceId);
    expect(after?.contact?.email).toBe('ana.prueba@example.com');
  });

  it('accepts idempotently', async () => {
    const { assignmentId } = await assignedTo(nordic);
    const session = ownerSession(nordic);
    const first = await acceptAssignment(db, { assignmentId, session, correlationId: 'req_1' });
    const second = await acceptAssignment(db, { assignmentId, session, correlationId: 'req_2' });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    const events = await db.select().from(outboxEvent).where(eq(outboxEvent.eventType, 'lead.accepted'));
    expect(events).toHaveLength(1);
  });

  it('refuses to accept after rejecting', async () => {
    const { assignmentId } = await assignedTo(nordic);
    const session = ownerSession(nordic);
    await rejectAssignment(db, { assignmentId, reasonCode: 'no_capacity', session, correlationId: 'req_1' });
    await expect(acceptAssignment(db, { assignmentId, session, correlationId: 'req_2' })).rejects.toMatchObject({
      code: 'ASSIGNMENT_ALREADY_RESOLVED',
    });
  });

  it('refuses to accept an expired assignment', async () => {
    const { assignmentId } = await assignedTo(nordic);
    await db
      .update(providerAssignment)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(providerAssignment.id, assignmentId));

    await expect(
      acceptAssignment(db, { assignmentId, session: ownerSession(nordic), correlationId: 'req_test' }),
    ).rejects.toMatchObject({ code: 'ASSIGNMENT_EXPIRED' });

    const [row] = await db.select().from(providerAssignment).where(eq(providerAssignment.id, assignmentId));
    expect(row?.status).toBe('expired');
  });
});

describe('provider pipeline', () => {
  async function acceptedAssignment() {
    const { leadId, config, marketplaceId } = await readyLead();
    const result = await assignProviders(db, {
      leadId,
      config,
      marketplaceId,
      providerCompanyIds: [nordic.companyId],
      actor: { type: 'operator', id: operatorId },
      correlationId: 'req_test',
    });
    const assignmentId = result.assignments[0]!.assignmentId;
    await acceptAssignment(db, { assignmentId, session: ownerSession(nordic), correlationId: 'req_test' });
    return { assignmentId, leadId };
  }

  it('stores a quote as integer minor units with a currency', async () => {
    const { assignmentId, leadId } = await acceptedAssignment();
    await submitQuote(db, {
      assignmentId,
      amountMinor: 12_345_600,
      currency: 'MXN',
      session: ownerSession(nordic),
      correlationId: 'req_test',
    });

    const [row] = await db.select().from(quote).where(eq(quote.leadId, leadId));
    expect(row?.amountMinor).toBe(12_345_600);
    expect(row?.currency).toBe('MXN');
    expect(Number.isInteger(row!.amountMinor)).toBe(true);

    const [leadRow] = await db.select().from(lead).where(eq(lead.id, leadId));
    expect(leadRow?.lifecycleStatus).toBe('quoted');
  });

  it('rejects a fractional quote amount', async () => {
    const { assignmentId } = await acceptedAssignment();
    await expect(
      submitQuote(db, {
        assignmentId,
        amountMinor: 1234.56,
        currency: 'MXN',
        session: ownerSession(nordic),
        correlationId: 'req_test',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
  });

  it('lets only a provider owner record a won project', async () => {
    const { assignmentId } = await acceptedAssignment();
    const memberSession = { ...ownerSession(nordic), roles: ['provider_member'] as Session['roles'] };

    await expect(
      recordOutcome(db, { assignmentId, outcome: 'won', session: memberSession, correlationId: 'req_1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // A member may still report a loss.
    await expect(
      recordOutcome(db, { assignmentId, outcome: 'lost', session: memberSession, correlationId: 'req_2' }),
    ).resolves.toMatchObject({ changed: true });
  });

  it('records a won outcome once and marks the project won', async () => {
    const { assignmentId, leadId } = await acceptedAssignment();
    const session = ownerSession(nordic);

    await recordOutcome(db, { assignmentId, outcome: 'won', valueMinor: 15_000_000, currency: 'MXN', session, correlationId: 'req_1' });
    const second = await recordOutcome(db, { assignmentId, outcome: 'won', session, correlationId: 'req_2' });

    expect(second.changed).toBe(false);
    const outcomes = await db.select().from(projectOutcome);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.valueMinor).toBe(15_000_000);
    // Provider-reported, not operator-verified.
    expect(outcomes[0]?.verifiedAt).toBeNull();

    const [leadRow] = await db.select().from(lead).where(eq(lead.id, leadId));
    expect(leadRow?.lifecycleStatus).toBe('won');
  });

  it('refuses pipeline commands before the assignment is accepted', async () => {
    const { leadId, config, marketplaceId } = await readyLead();
    const result = await assignProviders(db, {
      leadId,
      config,
      marketplaceId,
      providerCompanyIds: [nordic.companyId],
      actor: { type: 'operator', id: operatorId },
      correlationId: 'req_test',
    });

    await expect(
      submitQuote(db, {
        assignmentId: result.assignments[0]!.assignmentId,
        amountMinor: 100_000,
        currency: 'MXN',
        session: ownerSession(nordic),
        correlationId: 'req_test',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('outbox delivery', () => {
  it('delivers notifications asynchronously and records the communication', async () => {
    const { leadId, config, marketplaceId } = await readyLead();
    await assignProviders(db, {
      leadId,
      config,
      marketplaceId,
      providerCompanyIds: [nordic.companyId],
      actor: { type: 'operator', id: operatorId },
      correlationId: 'req_test',
    });

    // Nothing has been sent yet: the request path never calls the adapter.
    expect(email.sent).toHaveLength(0);

    const result = await processOutbox(db);
    expect(result.failed).toBe(0);
    expect(email.sent.some((message) => message.to === 'nordic@example.com')).toBe(true);

    const logged = await db.select().from(communication);
    expect(logged.some((row) => row.templateKey === 'provider_assignment_created' && row.status === 'sent')).toBe(true);
  });

  it('retries a transient failure and eventually dead-letters', async () => {
    const { leadId, config, marketplaceId } = await readyLead();
    await assignProviders(db, {
      leadId,
      config,
      marketplaceId,
      providerCompanyIds: [nordic.companyId],
      actor: { type: 'operator', id: operatorId },
      correlationId: 'req_test',
    });

    email.failuresRemaining = 100;

    let now = new Date();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await processOutbox(db, 10, now);
      // Jump past the backoff window.
      now = new Date(now.getTime() + 3_600_000);
    }

    const events = await db.select().from(outboxEvent).where(eq(outboxEvent.eventType, 'lead.assigned'));
    expect(events[0]?.status).toBe('dead_letter');
    expect(events[0]?.attempts).toBeGreaterThanOrEqual(6);
    expect(events[0]?.lastError).toContain('fake email provider failure');
  });

  it('does not deliver the same event twice', async () => {
    await readyLead();
    await processOutbox(db);
    const firstCount = email.sent.length;
    await processOutbox(db);
    expect(email.sent).toHaveLength(firstCount);
  });
});
