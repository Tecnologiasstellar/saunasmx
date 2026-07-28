import { permanentRedirect } from 'next/navigation';

/**
 * `/directorio` moved to `/proveedores`.
 *
 * The old route listed provider companies approved on the marketplace; the new
 * one lists directory profiles, which is a superset — an approved company gets
 * a profile linked by `directory_profile.provider_company_id`, and that link is
 * what earns the verified badge. Keeping both would have put two near-identical
 * provider lists in the index, competing for the same query.
 *
 * A 308 rather than a rewrite: the URL genuinely changed, inbound links should
 * follow it, and the method is preserved.
 */
export default function DirectoryRedirect(): never {
  permanentRedirect('/proveedores');
}
