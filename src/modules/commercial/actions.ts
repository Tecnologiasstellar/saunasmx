'use server';

import { revalidatePath } from 'next/cache';
import { requireFinanceAccess } from '../auth/current-user';
import { getDb } from '../database/client';
import { DomainError } from '../errors';
import { getMarketplaceId } from '../marketplace-config/publish';
import { newCorrelationId } from '../observability/logger';
import { resolveRequestHost } from '../site/context';
import { assignPlan, createPlan, endAgreement, setPlanActive, updatePlanTerms } from './agreements';
import { PLAN_TERMS_VERSION } from './terms';

/**
 * Commercial server actions.
 *
 * Every one re-authenticates and re-resolves the marketplace from the Host
 * header, so a form cannot move money-shaped records into another marketplace.
 */

export type CommercialActionState = { error?: string; message?: string };

async function financeContext() {
  const session = await requireFinanceAccess();
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') throw new DomainError('MARKETPLACE_NOT_FOUND', 'Unknown host', 404);
  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, resolution.config.slug);
  return {
    db,
    marketplaceId,
    currency: resolution.config.localization.currency,
    actor: { type: 'operator' as const, id: session.userId },
    correlationId: newCorrelationId(),
  };
}

function toState(error: unknown): CommercialActionState {
  if (error instanceof DomainError) return { error: error.message };
  throw error;
}

/** Reads the pricing fields. Forms collect pesos and percent; storage is minor units and bps. */
function termsFromForm(formData: FormData, currency: string) {
  const pesos = (field: string) => Math.round(Number(formData.get(field) ?? 0) * 100);
  return {
    version: PLAN_TERMS_VERSION,
    currency,
    monthlySubscriptionMinor: pesos('monthlySubscription'),
    qualifiedLeadFeeMinor: pesos('qualifiedLeadFee'),
    acceptedLeadFeeMinor: pesos('acceptedLeadFee'),
    appointmentFeeMinor: pesos('appointmentFee'),
    fixedSuccessFeeMinor: pesos('fixedSuccessFee'),
    successCommissionBps: Math.round(Number(formData.get('successCommissionPercent') ?? 0) * 100),
    featuredPlacement: formData.get('featuredPlacement') === 'on',
    note: String(formData.get('note') ?? '').trim() || undefined,
  };
}

export async function createPlanAction(
  _previous: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { db, marketplaceId, currency, actor, correlationId } = await financeContext();

  try {
    const { planId } = await createPlan(db, {
      marketplaceId,
      name: String(formData.get('name') ?? ''),
      terms: termsFromForm(formData, currency),
      actor,
      correlationId,
    });
    revalidatePath('/ops/planes');
    return { message: `Plan creado (${planId.slice(0, 8)}).` };
  } catch (error) {
    return toState(error);
  }
}

export async function updatePlanTermsAction(
  _previous: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { db, marketplaceId, currency, actor, correlationId } = await financeContext();

  try {
    await updatePlanTerms(db, {
      planId: String(formData.get('planId') ?? ''),
      marketplaceId,
      terms: termsFromForm(formData, currency),
      actor,
      correlationId,
    });
    revalidatePath('/ops/planes');
    return { message: 'Términos actualizados. Los acuerdos vigentes conservan los suyos.' };
  } catch (error) {
    return toState(error);
  }
}

export async function setPlanActiveAction(
  _previous: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { db, marketplaceId, actor, correlationId } = await financeContext();

  try {
    const active = formData.get('active') === 'true';
    await setPlanActive(db, { planId: String(formData.get('planId') ?? ''), marketplaceId, active, actor, correlationId });
    revalidatePath('/ops/planes');
    return { message: active ? 'Plan reactivado.' : 'Plan retirado del menú.' };
  } catch (error) {
    return toState(error);
  }
}

export async function assignPlanAction(
  _previous: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { db, marketplaceId, actor, correlationId } = await financeContext();
  const planId = String(formData.get('planId') ?? '');

  try {
    if (planId === '') {
      await endAgreement(db, {
        providerCompanyId: String(formData.get('providerCompanyId') ?? ''),
        marketplaceId,
        reason: 'operator_removed_plan',
        actor,
        correlationId,
      });
      revalidatePath('/ops/planes');
      return { message: 'Acuerdo terminado. El historial se conserva.' };
    }

    const result = await assignPlan(db, {
      providerCompanyId: String(formData.get('providerCompanyId') ?? ''),
      marketplaceId,
      planId,
      actor,
      correlationId,
    });
    revalidatePath('/ops/planes');
    return { message: result.changed ? 'Acuerdo firmado con los términos actuales.' : 'Sin cambios: ya estaba en ese plan.' };
  } catch (error) {
    return toState(error);
  }
}
