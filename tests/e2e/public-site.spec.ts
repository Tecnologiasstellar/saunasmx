import { expect, test } from '@playwright/test';

/**
 * Public marketing surfaces.
 *
 * The point of these tests is not that the pages look a particular way — it is
 * that every public claim is backed by the database, that no control on the
 * page is decorative, and that the funnel entry points all land on the real
 * questionnaire.
 */

test('the header CTA and the hero card both enter the real questionnaire', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('hero-cta').click();
  await expect(page).toHaveURL(/\/cotizar/);
  await expect(page.getByTestId('step-label')).toBeVisible();

  await page.goto('/');
  await page.getByTestId('primary-cta').click();
  await expect(page).toHaveURL(/\/cotizar/);
});

test('the hero preview reports the questionnaire real length, not the mockup four steps', async ({ page }) => {
  await page.goto('/');
  // config/marketplaces/suanas-mx/questionnaire.json has nine steps.
  await expect(page.getByRole('complementary')).toContainText('9 pasos');

  await page.goto('/cotizar');
  await expect(page.getByText('Paso 1 de 9')).toBeVisible();
});

test('every photo on the public pages actually decodes', async ({ page }) => {
  // Every other test on this page passes with all photography broken: text,
  // links and headings do not care whether an <img> resolved. During this
  // build the image optimizer returned 400 for every photo and nothing failed.
  // naturalWidth is the only assertion that proves a decode actually happened.
  for (const path of ['/', '/blog']) {
    await page.goto(path);
    const images = page.locator('img');
    expect(await images.count(), `${path} renders no photography at all`).toBeGreaterThan(0);

    // Polled, because a decode that is merely slow is not a failure.
    await expect
      .poll(
        async () =>
          await images.evaluateAll((nodes) =>
            nodes
              .filter((node) => {
                const image = node as HTMLImageElement;
                return image.complete && image.naturalWidth === 0;
              })
              .map((node) => (node as HTMLImageElement).currentSrc),
          ),
        { message: `${path} has photos that failed to load` },
      )
      .toEqual([]);
  }
});

test('no public link points at a placeholder href', async ({ page }) => {
  for (const path of ['/', '/lugares', '/proveedores', '/cotizar', '/gracias']) {
    await page.goto(path);
    const dead = await page.locator('a[href="#"], a[href=""]').count();
    expect(dead, `${path} has a placeholder link`).toBe(0);
  }
});

test('/directorio permanently redirects to the provider directory', async ({ page }) => {
  const response = await page.goto('/directorio');
  await expect(page).toHaveURL(/\/proveedores$/);
  expect(response?.status()).toBe(200);
});

test('the provider directory is scoped to this marketplace', async ({ page }) => {
  await page.goto('/proveedores');

  // Seeded companies approved on this marketplace, plus the researched
  // suppliers. Baja Spa Works is pending, so it has no directory profile, and
  // the pergola-only companies belong to another host.
  await expect(page.getByText('Nordic Sauna CDMX')).toBeVisible();
  await expect(page.getByText('Sauna & Steam')).toBeVisible();
  await expect(page.getByText('Baja Spa Works')).toHaveCount(0);
  await expect(page.getByText('Pérgolas del Valle')).toHaveCount(0);
});

test('the state filter changes the result set and stays a crawlable URL', async ({ page }) => {
  await page.goto('/proveedores');
  const all = await page.getByTestId('result-count').innerText();

  await page.getByRole('link', { name: 'Jalisco', exact: true }).click();

  await expect(page).toHaveURL(/estado=Jalisco/);
  const filtered = await page.getByTestId('result-count').innerText();
  expect(filtered).toContain('en Jalisco');
  expect(filtered).not.toEqual(all);
  await expect(page.getByText('Sauna & Steam')).toHaveCount(0);
});

test('a card leads to the profile, and the profile CTA reaches the questionnaire', async ({ page }) => {
  await page.goto('/proveedores');
  await page.getByRole('link', { name: /Ver perfil/ }).first().click();
  await expect(page).toHaveURL(/\/proveedores\/[a-z0-9-]+$/);

  await page.getByRole('link', { name: 'Solicitar cotización' }).first().click();
  await expect(page).toHaveURL(/\/cotizar\?proveedor=/);
  await expect(page.getByTestId('selected-provider')).toBeVisible();
  await expect(page.getByTestId('step-label')).toBeVisible();
});

test('a postal code carried in from an article prefills the form and is still validated', async ({ page }) => {
  await page.goto('/cotizar?cp=01000');
  await expect(page.getByTestId('input-postal-code')).toHaveValue('01000');

  // A malformed code is dropped rather than echoed into the field.
  await page.goto('/cotizar?cp=abc');
  await expect(page.getByTestId('input-postal-code')).toHaveValue('');

  await page.goto('/cotizar?cp=123');
  await expect(page.getByTestId('input-postal-code')).toHaveValue('');
  await page.getByTestId('next').click();
  await expect(page.getByTestId('form-error')).toBeVisible();
});

test('the public pages fit a narrow phone with no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });

  for (const path of ['/', '/lugares', '/proveedores', '/lugares/koti-wellness', '/proveedores/sauna-steam', '/cotizar', '/gracias', '/blog']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});

test('the directory is not indexable outside production', async ({ page }) => {
  await page.goto('/proveedores');
  const robots = await page.locator('meta[name="robots"]').getAttribute('content');
  expect(robots ?? '').toContain('noindex');
});

test('the footer carries the configured contact address, not a personal one', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');

  await expect(footer.getByRole('link', { name: 'tecnologiasstellar@gmail.com' })).toBeVisible();
  // The address this replaced. Anywhere on the page, not just the footer:
  // it was hardcoded in three files and each one had to stop repeating it.
  await expect(page.locator('body')).not.toContainText('albertovillalpando');
});

test('social icons show the brands without linking to profiles that do not exist', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');

  // Visible, so the brand reads as present on both networks...
  await expect(footer.getByLabel('Instagram — próximamente')).toBeVisible();
  await expect(footer.getByLabel('TikTok — próximamente')).toBeVisible();

  // ...but not anchors, because there is no account to link to yet. A guessed
  // profile URL would 404 on someone else's site.
  await expect(footer.locator('a[href*="instagram.com"]')).toHaveCount(0);
  await expect(footer.locator('a[href*="tiktok.com"]')).toHaveCount(0);
});

test('every footer destination resolves', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.getByRole('contentinfo').locator('a[href^="/"]').evaluateAll((links) =>
    [...new Set(links.map((link) => link.getAttribute('href')!))],
  );
  expect(hrefs.length, 'the footer links nowhere').toBeGreaterThan(4);

  for (const href of hrefs) {
    const response = await page.goto(href);
    expect(response?.status(), `${href} is linked from the footer but does not resolve`).toBeLessThan(400);
  }
});

test('the contact page hands over the address', async ({ page }) => {
  await page.goto('/contacto');
  await expect(page.getByRole('heading', { name: 'Contacto', level: 1 })).toBeVisible();
  await expect(page.locator('a[href="mailto:tecnologiasstellar@gmail.com"]').first()).toBeVisible();
});
