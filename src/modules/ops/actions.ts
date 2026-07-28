'use server';

import { revalidatePath } from 'next/cache';
import { requireOperator } from '../auth/current-user';
import { getDb } from '../database/client';
import { DomainError } from '../errors';
import { confirmLeadContact, discardLead, markLeadUnreachable, qualifyLead } from '../leads/commands';
import { getMarketplaceId } from '../marketplace-config/publish';
import { assignProviders } from '../matching-engine/assign';
import { newCorrelationId } from '../observability/logger';
import { resolveRequestHost } from '../site/context';

/**
 * Operator server actions.
 *
 * Each one re-authenticates, re-resolves the marketplace from the host, and
 * lets the domain command enforce the business rules. Nothing here trusts a
 * form field beyond the ids it names.
 */

async function operatorContext() {
  const session = await requireOperator();
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') throw new DomainError('MARKETPLACE_NOT_FOUND', 'Unknown host', 404);
  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, resolution.config.slug);
  return { session, config: resolution.config, db, marketplaceId };
}

export async function qualifyLeadAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get('leadId') ?? '');
  const { session, db, marketplaceId } = await operatorContext();

  await qualifyLead(db, {
    leadId,
    marketplaceId,
    actor: { type: 'operator', id: session.userId },
    correlationId: newCorrelationId(),
  });

  revalidatePath(`/ops/leads/${leadId}`);
  revalidatePath('/ops');
}

export async function discardLeadAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get('leadId') ?? '');
  const reasonCode = String(formData.get('reasonCode') ?? 'not_viable');
  const asSpam = formData.get('asSpam') === 'on';
  const { session, db, marketplaceId } = await operatorContext();

  await discardLead(db, {
    leadId,
    marketplaceId,
    actor: { type: 'operator', id: session.userId },
    correlationId: newCorrelationId(),
    reasonCode,
    asSpam,
  });

  revalidatePath(`/ops/leads/${leadId}`);
  revalidatePath('/ops');
}

export async function confirmLeadContactAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get('leadId') ?? '');
  const { session, db, marketplaceId } = await operatorContext();

  await confirmLeadContact(db, {
    leadId,
    marketplaceId,
    actor: { type: 'operator', id: session.userId },
    correlationId: newCorrelationId(),
  });

  revalidatePath(`/ops/leads/${leadId}`);
}

export async function markLeadUnreachableAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get('leadId') ?? '');
  const { session, db, marketplaceId } = await operatorContext();

  await markLeadUnreachable(db, {
    leadId,
    marketplaceId,
    actor: { type: 'operator', id: session.userId },
    correlationId: newCorrelationId(),
  });

  revalidatePath(`/ops/leads/${leadId}`);
}

export type AssignActionState = { error?: string; assigned?: number };

export async function assignProvidersAction(
  _previous: AssignActionState,
  formData: FormData,
): Promise<AssignActionState> {
  const leadId = String(formData.get('leadId') ?? '');
  const providerCompanyIds = formData.getAll('providerCompanyId').map(String).filter(Boolean);
  if (providerCompanyIds.length === 0) return { error: 'Selecciona al menos un proveedor.' };

  const { session, config, db, marketplaceId } = await operatorContext();

  try {
    const result = await assignProviders(db, {
      leadId,
      config,
      marketplaceId,
      providerCompanyIds,
      actor: { type: 'operator', id: session.userId },
      correlationId: newCorrelationId(),
    });
    revalidatePath(`/ops/leads/${leadId}`);
    revalidatePath('/ops');
    return { assigned: result.assignments.length };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}
