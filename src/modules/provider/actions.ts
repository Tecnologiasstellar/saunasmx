'use server';

import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireProviderUser } from '../auth/current-user';
import { getDb } from '../database/client';
import { DomainError } from '../errors';
import { getMarketplaceId } from '../marketplace-config/publish';
import { newCorrelationId } from '../observability/logger';
import { resolveRequestHost } from '../site/context';
import { acceptAssignment, recordContact, recordOutcome, rejectAssignment, submitQuote } from './commands';
import { allowedServiceKeys, updateCoverage } from './coverage';

/** Provider server actions. Every one re-authenticates before touching data. */

export type ProviderActionState = { error?: string; message?: string };

async function providerContext() {
  const session = await requireProviderUser();
  const db = await getDb();
  return { session, db, correlationId: newCorrelationId() };
}

function toState(error: unknown): ProviderActionState {
  if (error instanceof DomainError) return { error: error.message };
  throw error;
}

export async function acceptAssignmentAction(
  _previous: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const { session, db, correlationId } = await providerContext();
  try {
    await acceptAssignment(db, { assignmentId, session, correlationId });
    revalidatePath(`/portal/asignaciones/${assignmentId}`);
    revalidatePath('/portal');
    return { message: 'Proyecto aceptado. Ya puedes ver los datos de contacto.' };
  } catch (error) {
    return toState(error);
  }
}

export async function rejectAssignmentAction(
  _previous: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const reasonCode = String(formData.get('reasonCode') ?? 'not_interested');
  const { session, db, correlationId } = await providerContext();
  try {
    await rejectAssignment(db, { assignmentId, reasonCode, session, correlationId });
    revalidatePath(`/portal/asignaciones/${assignmentId}`);
    revalidatePath('/portal');
    return { message: 'Proyecto rechazado.' };
  } catch (error) {
    return toState(error);
  }
}

export async function recordContactAction(
  _previous: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const channel = String(formData.get('channel') ?? 'phone') as 'email' | 'whatsapp' | 'phone';
  const { session, db, correlationId } = await providerContext();
  try {
    await recordContact(db, { assignmentId, channel, session, correlationId });
    revalidatePath(`/portal/asignaciones/${assignmentId}`);
    return { message: 'Contacto registrado.' };
  } catch (error) {
    return toState(error);
  }
}

export async function submitQuoteAction(
  _previous: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const currency = String(formData.get('currency') ?? 'MXN');
  const scopeNotes = String(formData.get('scopeNotes') ?? '');
  const pesos = Number(formData.get('amount'));

  if (!Number.isFinite(pesos) || pesos <= 0) return { error: 'Introduce un importe válido.' };
  // The form collects pesos; storage is always integer minor units.
  const amountMinor = Math.round(pesos * 100);

  const { session, db, correlationId } = await providerContext();
  try {
    await submitQuote(db, { assignmentId, amountMinor, currency, scopeNotes, session, correlationId });
    revalidatePath(`/portal/asignaciones/${assignmentId}`);
    return { message: 'Cotización registrada.' };
  } catch (error) {
    return toState(error);
  }
}

export async function updateCoverageAction(
  _previous: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const { session, db, correlationId } = await providerContext();

  // The marketplace comes from the Host header, never from the form: a
  // provider must not be able to edit its coverage in another marketplace.
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const marketplaceId = await getMarketplaceId(db, resolution.config.slug);

  const providerCompanyId = String(formData.get('providerCompanyId') ?? '');
  // Only keys the configuration offers are even read out of the form.
  const services = allowedServiceKeys(resolution.config)
    .filter((serviceKey) => formData.get(`service:${serviceKey}`) === 'on')
    .map((serviceKey) => ({
      serviceKey,
      // The form collects pesos; storage is always integer minor units.
      minProjectValueMinor: Math.round(Number(formData.get(`min:${serviceKey}`) ?? 0) * 100),
    }));
  const postalPrefixes = String(formData.get('postalPrefixes') ?? '').split(/[\s,;]+/);

  try {
    const coverage = await updateCoverage(db, {
      providerCompanyId,
      marketplaceId,
      config: resolution.config,
      input: { services, postalPrefixes },
      session,
      correlationId,
    });
    revalidatePath('/portal/cobertura');
    return {
      message: `Cobertura actualizada: ${coverage.services.length} servicio(s), ${coverage.postalPrefixes.length} código(s) postal(es).`,
    };
  } catch (error) {
    return toState(error);
  }
}

export async function recordOutcomeAction(
  _previous: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const outcome = formData.get('outcome') === 'won' ? 'won' : 'lost';
  const rawValue = Number(formData.get('valueMinor'));
  const valueMinor = Number.isFinite(rawValue) && rawValue > 0 ? Math.round(rawValue * 100) : undefined;

  const { session, db, correlationId } = await providerContext();
  try {
    await recordOutcome(db, {
      assignmentId,
      outcome,
      valueMinor,
      currency: valueMinor ? 'MXN' : undefined,
      session,
      correlationId,
    });
    revalidatePath(`/portal/asignaciones/${assignmentId}`);
    revalidatePath('/portal');
    return { message: 'Resultado registrado.' };
  } catch (error) {
    return toState(error);
  }
}
