import { NextResponse, type NextRequest } from 'next/server';
import { listMarketplaces } from './modules/marketplace-config/registry';
import { parseHostMap, resolveHost } from './modules/marketplace-config/resolve-host';

/**
 * Redirects alias hostnames to the canonical domain, preserving path and query.
 *
 * docs/00-product-brief.md requires that a future domain spelling correction is
 * a configuration change, not a rebuild — this is the mechanism.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

const UNKNOWN_HOST_BODY = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow">
<title>Sitio no disponible</title></head>
<body style="font-family:system-ui;margin:4rem auto;max-width:32rem;padding:0 1rem;text-align:center">
<h1 style="font-size:1.25rem">Sitio no disponible</h1>
<p>Este dominio no está configurado.</p>
</body></html>`;

export default function proxy(request: NextRequest) {
  const isProduction = process.env.APP_ENV === 'production';
  const hostMap = isProduction ? undefined : parseHostMap(process.env.LOCAL_HOST_MAP);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');

  const resolution = resolveHost(host, listMarketplaces(), { hostMap });

  if (resolution.kind === 'unknown') {
    // Answered here rather than in the app: an unconfigured host gets a plain
    // 404 with no marketplace branding and no route rendering at all.
    return new NextResponse(UNKNOWN_HOST_BODY, {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
    });
  }

  if (resolution.kind !== 'redirect') return NextResponse.next();

  const target = new URL(request.nextUrl.toString());
  target.host = resolution.canonicalHost;
  if (isProduction) target.protocol = 'https:';
  // 308: permanent, and preserves the method so a POSTed form is not downgraded.
  return NextResponse.redirect(target, 308);
}
