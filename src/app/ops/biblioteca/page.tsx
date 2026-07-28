import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContentEditor } from '@/modules/auth/current-user';
import { getDb } from '@/modules/database/client';
import { listReviewQueue } from '@/modules/library/review';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { resolveRequestHost } from '@/modules/site/context';

export const metadata = { title: 'Revisión de biblioteca', robots: { index: false, follow: false } };

export default async function LibraryReviewQueue() {
  await requireContentEditor('/ops/biblioteca');
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown' || !resolution.config.features.library) notFound();
  const db = await getDb();
  const rows = await listReviewQueue(db, await getMarketplaceId(db, resolution.config.slug));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-[var(--brand)]">Biblioteca</p>
          <h1 className="mt-2 text-3xl font-semibold">Cola editorial</h1>
          <p className="mt-2 text-[var(--ink-muted)]">Nada llega al sitio público hasta aprobar procedencia, derechos y contenido.</p>
        </div>
        <Link href="/ops" className="underline">Volver a operaciones</Link>
      </div>

      <div className="mt-8 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--surface-muted)] text-[var(--ink-muted)]">
            <tr><th className="p-4">Recurso</th><th>Fuente</th><th>Formato</th><th>Estado</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--border)]">
                <td className="p-4 font-semibold">{row.title}</td>
                <td>{row.creatorName}</td>
                <td>{row.format}</td>
                <td>{row.status}</td>
                <td className="pr-4 text-right"><Link className="font-semibold text-[var(--brand)] underline" href={`/ops/biblioteca/${row.id}`}>Revisar</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <p className="mt-8 text-[var(--ink-muted)]">La cola está vacía.</p> : null}
    </main>
  );
}

