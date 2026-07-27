import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../database/client';
import {
  consumer,
  lead,
  project,
  projectLocation,
  projectRequirement,
  providerAssignment,
  quote,
} from '../database/schema';

/**
 * Provider read models.
 *
 * Every query takes the caller's company ids and filters on them in SQL. There
 * is no "load then check" path, so a mistake at a call site cannot leak another
 * company's data.
 *
 * Consumer contact details are withheld until the provider accepts the
 * assignment: the project description is enough to decide, and consent covers
 * sharing with an engaged provider, not with everyone offered the project.
 */

export type AssignmentListRow = {
  assignmentId: string;
  leadId: string;
  status: string;
  rank: number;
  assignedAt: Date;
  expiresAt: Date | null;
  postalCode: string | null;
  serviceKey: string | null;
};

export async function listAssignments(
  db: Database,
  providerCompanyIds: string[],
  marketplaceId: string,
): Promise<AssignmentListRow[]> {
  if (providerCompanyIds.length === 0) return [];

  const rows = await db
    .select({
      assignmentId: providerAssignment.id,
      leadId: providerAssignment.leadId,
      status: providerAssignment.status,
      rank: providerAssignment.rank,
      assignedAt: providerAssignment.assignedAt,
      expiresAt: providerAssignment.expiresAt,
      projectId: project.id,
      postalCode: projectLocation.postalCode,
    })
    .from(providerAssignment)
    .innerJoin(lead, eq(lead.id, providerAssignment.leadId))
    .innerJoin(project, eq(project.id, lead.projectId))
    .leftJoin(projectLocation, eq(projectLocation.projectId, project.id))
    .where(
      and(
        inArray(providerAssignment.providerCompanyId, providerCompanyIds),
        eq(project.marketplaceId, marketplaceId),
        isNull(providerAssignment.deletedAt),
      ),
    )
    .orderBy(desc(providerAssignment.assignedAt))
    .limit(200);

  if (rows.length === 0) return [];

  const services = await db
    .select({ projectId: projectRequirement.projectId, valueJson: projectRequirement.valueJson })
    .from(projectRequirement)
    .where(
      and(
        eq(projectRequirement.requirementKey, 'service_key'),
        eq(projectRequirement.source, 'derived'),
        inArray(projectRequirement.projectId, rows.map((row) => row.projectId)),
      ),
    );
  const serviceByProject = new Map(services.map((row) => [row.projectId, row.valueJson]));

  return rows.map((row) => {
    const service = serviceByProject.get(row.projectId);
    return {
      assignmentId: row.assignmentId,
      leadId: row.leadId,
      status: row.status,
      rank: row.rank,
      assignedAt: row.assignedAt,
      expiresAt: row.expiresAt,
      postalCode: row.postalCode,
      serviceKey: typeof service === 'string' ? service : null,
    };
  });
}

export type AssignmentDetail = {
  assignmentId: string;
  leadId: string;
  projectId: string;
  status: string;
  assignedAt: Date;
  expiresAt: Date | null;
  location: { postalCode: string; city: string | null; stateCode: string | null } | null;
  requirements: Array<{ key: string; value: unknown }>;
  /** Present only once the assignment has been accepted. */
  contact: { name: string; email: string; phone: string | null } | null;
  quotes: Array<{ id: string; amountMinor: number; currency: string; status: string; submittedAt: Date }>;
};

export async function getAssignmentDetail(
  db: Database,
  assignmentId: string,
  providerCompanyIds: string[],
  marketplaceId: string,
): Promise<AssignmentDetail | null> {
  if (providerCompanyIds.length === 0) return null;

  const [row] = await db
    .select({ assignment: providerAssignment, lead, project, consumer, location: projectLocation })
    .from(providerAssignment)
    .innerJoin(lead, eq(lead.id, providerAssignment.leadId))
    .innerJoin(project, eq(project.id, lead.projectId))
    .innerJoin(consumer, eq(consumer.id, project.consumerId))
    .leftJoin(projectLocation, eq(projectLocation.projectId, project.id))
    .where(
      and(
        eq(providerAssignment.id, assignmentId),
        inArray(providerAssignment.providerCompanyId, providerCompanyIds),
        eq(project.marketplaceId, marketplaceId),
        isNull(providerAssignment.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  const requirements = await db
    .select()
    .from(projectRequirement)
    .where(and(eq(projectRequirement.projectId, row.project.id), eq(projectRequirement.source, 'questionnaire')));

  const quotes = await db
    .select()
    .from(quote)
    .where(and(eq(quote.leadId, row.lead.id), inArray(quote.providerCompanyId, providerCompanyIds)))
    .orderBy(desc(quote.submittedAt));

  const accepted = row.assignment.status === 'accepted';

  return {
    assignmentId: row.assignment.id,
    leadId: row.lead.id,
    projectId: row.project.id,
    status: row.assignment.status,
    assignedAt: row.assignment.assignedAt,
    expiresAt: row.assignment.expiresAt,
    location: row.location
      ? { postalCode: row.location.postalCode, city: row.location.city, stateCode: row.location.stateCode }
      : null,
    requirements: requirements.map((requirement) => ({ key: requirement.requirementKey, value: requirement.valueJson })),
    contact: accepted ? { name: row.consumer.name, email: row.consumer.email, phone: row.consumer.phone } : null,
    quotes: quotes.map((entry) => ({
      id: entry.id,
      amountMinor: entry.amountMinor,
      currency: entry.currency,
      status: entry.status,
      submittedAt: entry.submittedAt,
    })),
  };
}
