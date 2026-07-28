'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContentEditor } from '../auth/current-user';
import { getDb } from '../database/client';
import { getMarketplaceId } from '../marketplace-config/publish';
import { resolveRequestHost } from '../site/context';
import { reviewResource } from './review';

function bool(formData: FormData, name: string): boolean {
  return formData.get(name) === 'on';
}

export async function reviewLibraryResourceAction(formData: FormData): Promise<void> {
  const resourceId = String(formData.get('resourceId') ?? '');
  const decision = String(formData.get('decision') ?? 'needs_review') as 'needs_review' | 'approved' | 'published' | 'rejected';
  if (!['needs_review', 'approved', 'published', 'rejected'].includes(decision)) throw new Error('Invalid review decision');

  const session = await requireContentEditor(`/ops/biblioteca/${resourceId}`);
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown' || !resolution.config.features.library) throw new Error('Library is not available on this host');
  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, resolution.config.slug);

  await reviewResource(db, {
    marketplaceId,
    resourceId,
    reviewerId: session.userId,
    decision,
    annotation: String(formData.get('annotation') ?? ''),
    takeaways: String(formData.get('takeaways') ?? '')
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean),
    rightsStatus: String(formData.get('rightsStatus') ?? 'pending') as Parameters<typeof reviewResource>[1]['rightsStatus'],
    evidenceLevel: String(formData.get('evidenceLevel') ?? 'unrated') as Parameters<typeof reviewResource>[1]['evidenceLevel'],
    rightsVerified: bool(formData, 'rightsVerified'),
    sourceVerifiedOfficial: bool(formData, 'sourceVerifiedOfficial'),
    claimsReviewed: bool(formData, 'claimsReviewed'),
    note: String(formData.get('note') ?? '').trim() || undefined,
  });

  revalidatePath('/biblioteca');
  revalidatePath('/sitemap.xml');
  redirect('/ops/biblioteca');
}

