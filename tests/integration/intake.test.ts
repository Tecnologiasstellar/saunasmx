import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@/modules/database/client';
import {
  attributionTouch,
  consentRecord,
  consumer,
  lead,
  leadStatusHistory,
  outboxEvent,
  project,
  projectLocation,
  projectRequirement,
  projectStatusHistory,
  questionnaireResponse,
} from '@/modules/database/schema';
import { submitProject } from '@/modules/intake/submit-project';
import { createTestDatabase } from '../helpers/database';
import { makeIntake, publishRepoConfigs, seedProvider, type PublishedMarketplaces } from '../helpers/fixtures';

/**
 * Consumer intake gate — docs/13-acceptance-criteria.md.
 */

let db: Database;
let published: PublishedMarketplaces;

beforeAll(async () => {
  db = await createTestDatabase();
});

beforeEach(async () => {
  // Fresh database per test keeps the duplicate-window assertions honest.
  db = await createTestDatabase();
  published = await publishRepoConfigs(db);
  await seedProvider(db, {
    name: 'Nordic Test',
    marketplaceId: published.id('suanas-mx'),
    services: ['traditional', 'infrared'],
    postalPrefixes: ['01', '03'],
    minValueMinor: 5_000_000,
  });
});

describe('project intake transaction', () => {
  it('creates every required record in one transaction', async () => {
    const config = published.config('suanas-mx');
    const marketplaceId = published.id('suanas-mx');
    const input = makeIntake(config, { answers: { type: 'traditional', budget: '100000_150000' } });

    const outcome = await submitProject(db, { config, marketplaceId, input, correlationId: 'req_test' });
    expect(outcome.status).toBe('created');

    const [projectRow] = await db.select().from(project).where(eq(project.id, outcome.projectId));
    expect(projectRow?.status).toBe('submitted');
    expect(projectRow?.marketplaceId).toBe(marketplaceId);

    const [consumerRow] = await db.select().from(consumer).where(eq(consumer.id, projectRow!.consumerId));
    expect(consumerRow?.email).toBe('ana.prueba@example.com');
    // Phone is normalized to E.164 on the way in.
    expect(consumerRow?.phone).toBe('+525512345678');

    const [locationRow] = await db.select().from(projectLocation).where(eq(projectLocation.projectId, outcome.projectId));
    expect(locationRow?.postalCode).toBe('01000');
    expect(locationRow?.countryCode).toBe('MX');

    const requirements = await db.select().from(projectRequirement).where(eq(projectRequirement.projectId, outcome.projectId));
    const keys = requirements.map((row) => row.requirementKey);
    expect(keys).toContain('type');
    expect(keys).toContain('budget');
    expect(keys).toContain('service_key');
    expect(keys).toContain('budget_range');

    const [response] = await db
      .select()
      .from(questionnaireResponse)
      .where(eq(questionnaireResponse.projectId, outcome.projectId));
    // The raw payload is preserved verbatim alongside the structured values.
    expect(response?.answersJson).toMatchObject({ type: 'traditional', budget: '100000_150000' });
    expect(response?.questionnaireId).toBe(config.questionnaire.id);

    const [attribution] = await db.select().from(attributionTouch).where(eq(attributionTouch.projectId, outcome.projectId));
    expect(attribution?.channel).toBe('google');
    expect(attribution?.campaign).toBe('brand');
  });

  it('stores consent with purpose, policy version and timestamp', async () => {
    const config = published.config('suanas-mx');
    const outcome = await submitProject(db, {
      config,
      marketplaceId: published.id('suanas-mx'),
      input: makeIntake(config),
      correlationId: 'req_test',
    });

    const consents = await db.select().from(consentRecord).where(eq(consentRecord.projectId, outcome.projectId));
    expect(consents).toHaveLength(2);
    for (const record of consents) {
      expect(record.granted).toBe(true);
      expect(record.policyVersion).toBe('privacy-2026-01');
      expect(record.capturedAt).toBeInstanceOf(Date);
      expect(record.captureSource).toBe('questionnaire');
    }
    expect(consents.map((record) => record.purpose).sort()).toEqual(['lead_contact', 'provider_sharing']);
  });

  it('keeps the project and the lead as separate records', async () => {
    const config = published.config('suanas-mx');
    const outcome = await submitProject(db, {
      config,
      marketplaceId: published.id('suanas-mx'),
      input: makeIntake(config),
      correlationId: 'req_test',
    });

    const [leadRow] = await db.select().from(lead).where(eq(lead.id, outcome.leadId!));
    expect(leadRow?.projectId).toBe(outcome.projectId);
    expect(leadRow?.id).not.toBe(outcome.projectId);
  });

  it('writes both status histories', async () => {
    const config = published.config('suanas-mx');
    const outcome = await submitProject(db, {
      config,
      marketplaceId: published.id('suanas-mx'),
      input: makeIntake(config),
      correlationId: 'req_test',
    });

    const projectHistory = await db.select().from(projectStatusHistory).where(eq(projectStatusHistory.projectId, outcome.projectId));
    expect(projectHistory).toHaveLength(1);
    expect(projectHistory[0]).toMatchObject({ fromStatus: 'draft', toStatus: 'submitted', actorType: 'consumer' });

    const leadHistory = await db.select().from(leadStatusHistory).where(eq(leadStatusHistory.leadId, outcome.leadId!));
    expect(leadHistory).toHaveLength(1);
    expect(leadHistory[0]).toMatchObject({ fromStatus: 'created', toStatus: 'review_required', actorType: 'system' });
  });

  it('writes project.created to the outbox and notifies nobody synchronously', async () => {
    const config = published.config('suanas-mx');
    const outcome = await submitProject(db, {
      config,
      marketplaceId: published.id('suanas-mx'),
      input: makeIntake(config),
      correlationId: 'req_test',
    });

    const events = await db.select().from(outboxEvent);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'project.created', entityType: 'project', status: 'pending' });
    // The event carries reference ids only — no contact details.
    const payload = JSON.stringify(events[0]!.payloadJson);
    expect(payload).not.toContain('ana.prueba@example.com');
    expect(payload).not.toContain('5512345678');
    expect(payload).toContain(outcome.projectId);
  });

  it('is idempotent: replaying the same key creates nothing new', async () => {
    const config = published.config('suanas-mx');
    const marketplaceId = published.id('suanas-mx');
    const input = makeIntake(config, { idempotencyKey: 'stable-key-12345678' });

    const first = await submitProject(db, { config, marketplaceId, input, correlationId: 'req_1' });
    const second = await submitProject(db, { config, marketplaceId, input, correlationId: 'req_2' });

    expect(second.status).toBe('duplicate_request');
    expect(second.projectId).toBe(first.projectId);
    expect(second.leadId).toBe(first.leadId);

    expect(await db.select().from(project)).toHaveLength(1);
    expect(await db.select().from(lead)).toHaveLength(1);
    expect(await db.select().from(outboxEvent)).toHaveLength(1);
  });

  it('flags a second submission from the same consumer within 24 hours for review', async () => {
    const config = published.config('suanas-mx');
    const marketplaceId = published.id('suanas-mx');

    await submitProject(db, { config, marketplaceId, input: makeIntake(config), correlationId: 'req_1' });
    const second = await submitProject(db, { config, marketplaceId, input: makeIntake(config), correlationId: 'req_2' });

    expect(second.status).toBe('created');
    expect(second.reasons).toContain('possible_duplicate_within_24h');

    const [leadRow] = await db.select().from(lead).where(eq(lead.id, second.leadId!));
    expect(leadRow?.qualificationStatus).toBe('review_required');
  });

  it('marks a high-frequency submitter as spam and creates no lead', async () => {
    const config = published.config('suanas-mx');
    const marketplaceId = published.id('suanas-mx');

    let last = await submitProject(db, { config, marketplaceId, input: makeIntake(config), correlationId: 'req_0' });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      last = await submitProject(db, { config, marketplaceId, input: makeIntake(config), correlationId: `req_${attempt}` });
    }

    expect(last.status).toBe('spam');
    expect(last.leadId).toBeNull();

    const [projectRow] = await db.select().from(project).where(eq(project.id, last.projectId));
    expect(projectRow?.status).toBe('spam');

    // A spam project is never a distribution opportunity, so no event is emitted for it.
    const events = await db.select().from(outboxEvent).where(eq(outboxEvent.entityId, last.projectId));
    expect(events).toHaveLength(0);
  });

  it('treats free text carrying multiple links as spam', async () => {
    // The rule scans every string in `answers`. It used to be proved through a
    // `notes` step, but the lead-grading rebuild removed it and neither live
    // questionnaire now has a free-text answer at all — the only text fields
    // left (city, street_address) travel in `location`, which this rule does
    // not read. So the config gets the step appended here, which keeps the rule
    // covered against the day a marketplace adds free text back.
    //
    // Worth knowing: as configured today this rule cannot fire on either live
    // marketplace. It is a guard for future configs, not active protection.
    const base = published.config('suanas-mx');
    const config: typeof base = {
      ...base,
      questionnaire: {
        ...base.questionnaire,
        steps: [
          ...base.questionnaire.steps,
          { id: 'notes', type: 'long_text', label: 'Detalles', required: false, maxLength: 500 },
        ],
      },
    };

    const outcome = await submitProject(db, {
      config,
      marketplaceId: published.id('suanas-mx'),
      input: makeIntake(config, {
        answers: { notes: 'visita http://spam.example y también https://otro.example ahora' },
      }),
      correlationId: 'req_test',
    });

    expect(outcome.status).toBe('spam');
    expect(outcome.reasons).toContain('free_text_contains_links');
  });

  it('flags a postal code no approved provider covers', async () => {
    const config = published.config('suanas-mx');
    const outcome = await submitProject(db, {
      config,
      marketplaceId: published.id('suanas-mx'),
      // 99999 is outside the seeded 01/03 prefixes.
      input: makeIntake(config, { postalCode: '99999' }),
      correlationId: 'req_test',
    });

    expect(outcome.reasons).toContain('no_serviceable_provider_in_territory');
    const [leadRow] = await db.select().from(lead).where(eq(lead.id, outcome.leadId!));
    expect(leadRow?.qualificationStatus).toBe('review_required');
  });

  it('does not count an unapproved provider as serviceability', async () => {
    const marketplaceId = published.id('suanas-mx');
    await seedProvider(db, {
      name: 'Pending Only',
      marketplaceId,
      status: 'pending',
      services: ['traditional'],
      postalPrefixes: ['99'],
    });

    const config = published.config('suanas-mx');
    const outcome = await submitProject(db, {
      config,
      marketplaceId,
      input: makeIntake(config, { postalCode: '99123' }),
      correlationId: 'req_test',
    });

    expect(outcome.reasons).toContain('no_serviceable_provider_in_territory');
  });

  it('runs the identical code path for a second marketplace', async () => {
    const config = published.config('pergolas-mx');
    const marketplaceId = published.id('pergolas-mx');
    await seedProvider(db, {
      name: 'Pergolas Test',
      marketplaceId,
      services: ['wood', 'aluminum'],
      postalPrefixes: ['01'],
    });

    const outcome = await submitProject(db, {
      config,
      marketplaceId,
      // `material`, not `type` — the dimension comes from answer_mapping.
      input: makeIntake(config, { email: 'beto.prueba@example.com', answers: { material: 'aluminum', budget: '50000_100000' } }),
      correlationId: 'req_test',
    });

    expect(outcome.status).toBe('created');
    const requirements = await db
      .select()
      .from(projectRequirement)
      .where(and(eq(projectRequirement.projectId, outcome.projectId), eq(projectRequirement.requirementKey, 'service_key')));
    expect(requirements[0]?.valueJson).toBe('aluminum');
  });
});
