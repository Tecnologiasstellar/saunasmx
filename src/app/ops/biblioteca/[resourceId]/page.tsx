import { notFound } from 'next/navigation';
import { requireContentEditor } from '@/modules/auth/current-user';
import { getDb } from '@/modules/database/client';
import { reviewLibraryResourceAction } from '@/modules/library/actions';
import { getReviewCandidate } from '@/modules/library/review';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { resolveRequestHost } from '@/modules/site/context';

export const metadata = { title: 'Revisar recurso', robots: { index: false, follow: false } };

const RIGHTS = ['official_embed', 'licensed', 'creator_approved', 'creative_commons', 'public_domain', 'link_only', 'pending', 'blocked'];
const EVIDENCE = ['systematic_review', 'primary_research', 'qualified_expert', 'industry', 'lived_experience', 'commercial', 'unrated'];

export default async function ReviewResource({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  await requireContentEditor(`/ops/biblioteca/${resourceId}`);
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown' || !resolution.config.features.library) notFound();
  const db = await getDb();
  const candidate = await getReviewCandidate(db, await getMarketplaceId(db, resolution.config.slug), resourceId);
  if (!candidate) notFound();
  const takeaways = Array.isArray(candidate.resource.takeawaysJson)
    ? candidate.resource.takeawaysJson.filter((item): item is string => typeof item === 'string').join('\n')
    : '';

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-sm font-semibold uppercase tracking-wider text-[var(--brand)]">Revisión editorial</p>
      <h1 className="mt-2 text-3xl font-semibold">{candidate.resource.title}</h1>
      <p className="mt-3 text-[var(--ink-muted)]">{candidate.creator.name} · {candidate.resource.externalPlatform}</p>

      <div className="mt-6 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--brand-soft)] p-5 text-sm">
        <p><strong>Cuenta oficial configurada:</strong> {candidate.channel.officialAccount ? 'Sí' : 'No'}</p>
        <p className="mt-2"><strong>Evidencia de cuenta:</strong>{' '}
          <a className="underline" href={candidate.channel.verificationUrl} target="_blank" rel="noreferrer noopener">comprobar en sitio oficial ↗</a>
        </p>
        <p className="mt-2"><strong>Publicación original:</strong>{' '}
          <a className="underline" href={candidate.resource.canonicalUrl} target="_blank" rel="noreferrer noopener">abrir recurso ↗</a>
        </p>
      </div>

      <form action={reviewLibraryResourceAction} className="mt-8 grid gap-6">
        <input type="hidden" name="resourceId" value={resourceId} />
        <label className="grid gap-2">
          <span className="font-semibold">Anotación original de Saunas.mx</span>
          <textarea name="annotation" defaultValue={candidate.resource.annotation ?? ''} rows={7} required className="rounded-[var(--radius)] border border-[var(--border)] p-4" />
        </label>
        <label className="grid gap-2">
          <span className="font-semibold">Aprendizajes, uno por línea</span>
          <textarea name="takeaways" defaultValue={takeaways} rows={5} className="rounded-[var(--radius)] border border-[var(--border)] p-4" />
        </label>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2"><span className="font-semibold">Derechos</span>
            <select name="rightsStatus" defaultValue={candidate.resource.rightsStatus} className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              {RIGHTS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-2"><span className="font-semibold">Nivel de evidencia</span>
            <select name="evidenceLevel" defaultValue={candidate.resource.evidenceLevel} className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              {EVIDENCE.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <fieldset className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border)] p-5">
          <legend className="px-2 font-semibold">Controles obligatorios para publicar</legend>
          <label className="flex gap-3"><input type="checkbox" name="sourceVerifiedOfficial" /> Verifiqué que proviene de la cuenta oficial.</label>
          <label className="flex gap-3"><input type="checkbox" name="rightsVerified" /> Verifiqué el permiso de embed/enlace y activos.</label>
          <label className="flex gap-3"><input type="checkbox" name="claimsReviewed" /> Revisé afirmaciones, seguridad y contexto comercial.</label>
        </fieldset>
        <label className="grid gap-2"><span className="font-semibold">Nota interna</span>
          <textarea name="note" rows={3} className="rounded-[var(--radius)] border border-[var(--border)] p-4" />
        </label>
        <div className="flex flex-wrap gap-3">
          <button name="decision" value="needs_review" className="rounded-[var(--radius)] border border-[var(--border)] px-5 py-3 font-semibold">Guardar borrador</button>
          <button name="decision" value="approved" className="rounded-[var(--radius)] border border-[var(--brand)] px-5 py-3 font-semibold text-[var(--brand)]">Aprobar</button>
          <button name="decision" value="published" className="rounded-[var(--radius)] bg-[var(--brand)] px-5 py-3 font-semibold text-[var(--brand-ink)]">Publicar</button>
          <button name="decision" value="rejected" className="rounded-[var(--radius)] border border-red-300 px-5 py-3 font-semibold text-red-700">Rechazar</button>
        </div>
      </form>
    </main>
  );
}

