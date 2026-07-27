import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../database/client';
import {
  consentRecord,
  consumer,
  lead,
  leadStatusHistory,
  outboxEvent,
  project,
  projectLocation,
  projectRequirement,
  providerAssignment,
  providerCompany,
} from '../database/schema';

/** Read models for the operator portal. */

export type LeadListRow = {
  leadId: string;
  projectId: string;
  lifecycleStatus: string;
  qualificationStatus: string;
  createdAt: Date;
  postalCode: string | null;
  serviceKey: string | null;
  assignmentCount: number;
};

export async function listLeads(
  db: Database,
  marketplaceId: string,
  filter: { lifecycleStatus?: string } = {},
): Promise<LeadListRow[]> {
  const rows = await db
    .select({
      leadId: lead.id,
      projectId: project.id,
      lifecycleStatus: lead.lifecycleStatus,
      qualificationStatus: lead.qualificationStatus,
      createdAt: lead.createdAt,
      postalCode: projectLocation.postalCode,
    })
    .from(lead)
    .innerJoin(project, eq(project.id, lead.projectId))
    .leftJoin(projectLocation, eq(projectLocation.projectId, project.id))
    .where(
      filter.lifecycleStatus
        ? and(eq(project.marketplaceId, marketplaceId), eq(lead.lifecycleStatus, filter.lifecycleStatus as 'created'))
        : eq(project.marketplaceId, marketplaceId),
    )
    .orderBy(desc(lead.createdAt))
    .limit(200);

  if (rows.length === 0) return [];

  const services = await db
    .select({ projectId: projectRequirement.projectId, valueJson: projectRequirement.valueJson })
    .from(projectRequirement)
    .where(and(eq(projectRequirement.requirementKey, 'service_key'), eq(projectRequirement.source, 'derived')));
  const serviceByProject = new Map(services.map((row) => [row.projectId, row.valueJson]));

  const assignments = await db.select({ leadId: providerAssignment.leadId }).from(providerAssignment);
  const countByLead = new Map<string, number>();
  for (const row of assignments) countByLead.set(row.leadId, (countByLead.get(row.leadId) ?? 0) + 1);

  return rows.map((row) => {
    const service = serviceByProject.get(row.projectId);
    return {
      ...row,
      serviceKey: typeof service === 'string' ? service : null,
      assignmentCount: countByLead.get(row.leadId) ?? 0,
    };
  });
}

export type LeadDetail = {
  leadId: string;
  projectId: string;
  marketplaceId: string;
  lifecycleStatus: string;
  qualificationStatus: string;
  createdAt: Date;
  consumer: { name: string; email: string; phone: string | null };
  location: { postalCode: string; city: string | null; stateCode: string | null } | null;
  requirements: Array<{ key: string; value: unknown; source: string }>;
  consents: Array<{ purpose: string; granted: boolean; policyVersion: string; capturedAt: Date }>;
  history: Array<{ fromStatus: string | null; toStatus: string; reason: string | null; actorType: string; createdAt: Date }>;
  assignments: Array<{ id: string; providerCompanyId: string; providerName: string; status: string; rank: number; score: number }>;
};

export async function getLeadDetail(db: Database, marketplaceId: string, leadId: string): Promise<LeadDetail | null> {
  const [row] = await db
    .select({ lead, project, consumer, location: projectLocation })
    .from(lead)
    .innerJoin(project, eq(project.id, lead.projectId))
    .innerJoin(consumer, eq(consumer.id, project.consumerId))
    .leftJoin(projectLocation, eq(projectLocation.projectId, project.id))
    // Scoped to the marketplace: an id from another tenant must not resolve.
    .where(and(eq(lead.id, leadId), eq(project.marketplaceId, marketplaceId)))
    .limit(1);

  if (!row) return null;

  const requirements = await db.select().from(projectRequirement).where(eq(projectRequirement.projectId, row.project.id));
  const consents = await db.select().from(consentRecord).where(eq(consentRecord.projectId, row.project.id));
  const history = await db
    .select()
    .from(leadStatusHistory)
    .where(eq(leadStatusHistory.leadId, leadId))
    .orderBy(leadStatusHistory.createdAt);
  const assignments = await db
    .select({
      id: providerAssignment.id,
      providerCompanyId: providerAssignment.providerCompanyId,
      providerName: providerCompany.displayName,
      status: providerAssignment.status,
      rank: providerAssignment.rank,
      score: providerAssignment.score,
    })
    .from(providerAssignment)
    .innerJoin(providerCompany, eq(providerCompany.id, providerAssignment.providerCompanyId))
    .where(eq(providerAssignment.leadId, leadId))
    .orderBy(providerAssignment.rank);

  return {
    leadId: row.lead.id,
    projectId: row.project.id,
    marketplaceId: row.project.marketplaceId,
    lifecycleStatus: row.lead.lifecycleStatus,
    qualificationStatus: row.lead.qualificationStatus,
    createdAt: row.lead.createdAt,
    consumer: { name: row.consumer.name, email: row.consumer.email, phone: row.consumer.phone },
    location: row.location
      ? { postalCode: row.location.postalCode, city: row.location.city, stateCode: row.location.stateCode }
      : null,
    requirements: requirements.map((requirement) => ({
      key: requirement.requirementKey,
      value: requirement.valueJson,
      source: requirement.source,
    })),
    consents: consents.map((consent) => ({
      purpose: consent.purpose,
      granted: consent.granted,
      policyVersion: consent.policyVersion,
      capturedAt: consent.capturedAt,
    })),
    history: history.map((entry) => ({
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      reason: entry.reason,
      actorType: entry.actorType,
      createdAt: entry.createdAt,
    })),
    assignments,
  };
}

/** Dead-lettered and failing events, for the operational dashboard in docs/11. */
export async function listOutboxProblems(db: Database, marketplaceId: string) {
  return db
    .select()
    .from(outboxEvent)
    .where(and(eq(outboxEvent.marketplaceId, marketplaceId), eq(outboxEvent.status, 'dead_letter')))
    .orderBy(desc(outboxEvent.createdAt))
    .limit(50);
}
