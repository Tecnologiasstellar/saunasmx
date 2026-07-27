import { expect, test } from '@playwright/test';

/**
 * Second-marketplace gate — docs/13-acceptance-criteria.md.
 *
 * The pergola marketplace is served by exactly the same routes and components.
 * Everything that differs comes from config/marketplaces/pergolas-mx/.
 */

const PERGOLAS = 'http://pergolas.localhost:3100';

test('renders a distinct brand and theme from the shared code path', async ({ page }) => {
  await page.goto(`${PERGOLAS}/`);

  await expect(page).toHaveTitle(/Pérgolas México/);
  await expect(page.locator('h1')).toContainText('Pérgolas a medida');

  // The theme is applied from the marketplace's configured theme key.
  const style = await page.locator('html').getAttribute('style');
  expect(style).toContain('--brand:#1f4d35');

  await page.goto('/');
  const sauna = await page.locator('html').getAttribute('style');
  expect(sauna).toContain('--brand:#7c3f19');
  expect(sauna).not.toEqual(style);
});

test('renders a different questionnaire without a category-specific route', async ({ page }) => {
  await page.goto(`${PERGOLAS}/cotizar`);

  await page.getByTestId('input-postal-code').fill('01000');
  await page.getByTestId('next').click();

  // Pergola-only options, from the same runtime that renders the sauna form.
  await expect(page.getByTestId('option-setting-terrace')).toBeVisible();
  await page.getByTestId('option-setting-terrace').click();
  await page.getByTestId('next').click();

  // The matching dimension is `material` here and `type` on the sauna site.
  await expect(page.getByTestId('option-material-aluminum')).toBeVisible();
});

test('a provider can participate in both marketplaces with one identity', async ({ page }) => {
  // Grupo Exterior MX is approved on both. Signing in on the pergola host
  // shows the pergola portal for the same account.
  await page.goto(`${PERGOLAS}/entrar?next=%2Fportal`);
  await page.getByTestId('login-email').fill('owner.exterior@example.com');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('dev-login-link').click();

  await expect(page).toHaveURL(/pergolas\.localhost:3100\/portal/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Pérgolas México');
});

test('an unconfigured host fails safely with no branding', async ({ page }) => {
  const response = await page.goto('http://unknown.localhost:3100/');
  expect(response?.status()).toBe(404);
  await expect(page.locator('body')).not.toContainText('Suanas');
  await expect(page.locator('body')).not.toContainText('Pérgolas');
});
