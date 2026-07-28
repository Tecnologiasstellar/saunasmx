import { expect, test } from '@playwright/test';

/**
 * The directory in a browser.
 *
 * One template serves both kinds, so these tests check that the two things
 * which genuinely differ are right — the call to action and the wording around
 * it — and that the records we said we would not publish are not reachable.
 */

test('a place profile renders the hero and sends the visitor to the venue', async ({ page }) => {
  await page.goto('/lugares/koti-wellness');

  // Scoped to the hero: the blurb also appears in the About paragraph below it.
  const hero = page.getByTestId('profile-hero');
  await expect(hero.getByRole('heading', { level: 1, name: 'Koti Wellness' })).toBeVisible();
  await expect(hero.getByText('Lugar para sauna')).toBeVisible();
  await expect(hero.getByText(/Estudio de terapia de contraste con tres sedes/)).toBeVisible();
  await expect(hero.getByText('Información revisada el 27 de julio de 2026')).toBeVisible();

  const cta = hero.getByRole('link', { name: /Reservar sesión/ });
  await expect(cta).toHaveAttribute('href', 'https://www.kotiwellness.com/');
  await expect(cta).toHaveAttribute('target', '_blank');
  // Both are required: `noopener` closes the reverse-tabnabbing hole, and the
  // directory does not vouch for an external page's SEO.
  await expect(cta).toHaveAttribute('rel', /noopener/);
  await expect(cta).toHaveAttribute('rel', /noreferrer/);
});

test('a provider profile keeps the lead on our own quote route', async ({ page }) => {
  await page.goto('/proveedores/sauna-steam');

  await expect(page.getByRole('heading', { level: 1, name: 'Sauna & Steam' })).toBeVisible();
  await expect(page.getByTestId('profile-hero').getByText('Proveedor de saunas')).toBeVisible();

  const cta = page.getByTestId('profile-hero').getByRole('link', { name: 'Solicitar cotización' });
  await expect(cta).toHaveAttribute('href', '/cotizar?proveedor=sauna-steam');
  await expect(cta).not.toHaveAttribute('target', '_blank');

  await cta.click();
  await expect(page.getByTestId('selected-provider')).toContainText('Sauna & Steam');
});

test('the access condition is visible without opening anything', async ({ page }) => {
  // A men-only bathhouse and a private buyout are the two listings most likely
  // to waste a trip, so the restriction has to be on the page as plain text.
  await page.goto('/lugares/stic-banos-de-vapor-spa');
  await expect(
    page.getByTestId('profile-hero').getByText('El establecimiento declara servicio exclusivo para hombres adultos.'),
  ).toBeVisible();

  await page.goto('/lugares/tulum-bath-house');
  await expect(
    page.getByTestId('profile-hero').getByText('Sólo renta del lugar completo, hasta 20 personas.'),
  ).toBeVisible();
});

test('a venue that cannot be booked directly does not promise a booking', async ({ page }) => {
  await page.goto('/lugares/currents-spa-at-the-cape');
  await expect(page.getByTestId('profile-hero').getByRole('link', { name: /Ver opciones de reserva/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Reservar sesión/ })).toHaveCount(0);
});

test('records held back for verification are unreachable', async ({ page }) => {
  for (const path of ['/lugares/summit-wellness-club', '/proveedores/finlandesa-spa']) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should not be public`).toBe(404);
  }
});

test('no public directory page shows a raw unknown value', async ({ page }) => {
  const paths = [
    '/lugares',
    '/proveedores',
    '/lugares/koti-wellness',
    '/lugares/stic-banos-de-vapor-spa',
    '/proveedores/sauna-steam',
    '/proveedores/osfasa-corporacion',
  ];

  for (const path of paths) {
    await page.goto(path);
    const body = await page.locator('body').innerText();
    expect(body, `${path} leaked an unknown value`).not.toContain('PENDIENTE');
  }
});

test('breadcrumbs and structured data agree with the page', async ({ page }) => {
  await page.goto('/lugares/koti-wellness');

  const crumbs = page.getByRole('navigation', { name: 'Ruta de navegación' });
  await expect(crumbs.getByRole('link', { name: 'Lugares' })).toHaveAttribute('href', '/lugares');
  await expect(crumbs.getByRole('link', { name: 'Ciudad de México' })).toHaveAttribute(
    'href',
    '/lugares?estado=Ciudad%20de%20M%C3%A9xico',
  );

  const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').first().innerText()) || '{}');
  const graph = jsonLd['@graph'] as Array<Record<string, unknown>>;
  const business = graph.find((node) => node['@type'] === 'LocalBusiness');
  const breadcrumbs = graph.find((node) => node['@type'] === 'BreadcrumbList');

  expect(business?.name).toBe('Koti Wellness');
  expect(breadcrumbs).toBeTruthy();
  // Nothing we have not verified may be marked up as fact.
  expect(business).not.toHaveProperty('aggregateRating');
  expect(business).not.toHaveProperty('priceRange');
  expect(business).not.toHaveProperty('openingHours');
});

test('a cross-link connects the two halves of the directory', async ({ page }) => {
  await page.goto('/lugares/koti-wellness');
  await expect(page.getByRole('link', { name: 'Explora proveedores' })).toHaveAttribute('href', '/proveedores');

  await page.goto('/proveedores/sauna-steam');
  await expect(page.getByRole('link', { name: 'Explora lugares' })).toHaveAttribute('href', '/lugares');
});

test('the profile is keyboard reachable with a visible focus ring', async ({ page }) => {
  await page.goto('/proveedores/sauna-steam');

  const cta = page.getByTestId('profile-hero').getByRole('link', { name: 'Solicitar cotización' });
  await cta.focus();
  await expect(cta).toBeFocused();

  const outline = await cta.evaluate((node) => getComputedStyle(node).outlineWidth);
  expect(outline).not.toBe('0px');
});

test('an unknown provider in the quote link is ignored rather than echoed', async ({ page }) => {
  await page.goto('/cotizar?proveedor=<script>alert(1)</script>');
  await expect(page.getByTestId('selected-provider')).toHaveCount(0);
  await expect(page.getByTestId('step-label')).toBeVisible();
});
