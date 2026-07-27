import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end journey across all three surfaces, on a real browser against a
 * real (embedded) PostgreSQL, using only the seeded synthetic fixtures.
 *
 * Consumer submits → operator qualifies and assigns → provider accepts and quotes.
 */

const CONSUMER_EMAIL = `e2e.${Date.now()}@example.com`;

async function signIn(page: Page, email: string, next: string) {
  await page.goto(`/entrar?next=${encodeURIComponent(next)}`);
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-sent')).toBeVisible();
  // Outside production the magic link is surfaced in the page, so the test
  // needs no mailbox. The token is still single-use and still expires.
  await page.getByTestId('dev-login-link').click();
}

test.describe.configure({ mode: 'serial' });

test('consumer submits a sauna project through the configured questionnaire', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Saunas a medida');

  await page.getByTestId('primary-cta').click();
  await expect(page).toHaveURL(/\/cotizar/);

  await page.getByTestId('input-postal-code').fill('01000');
  await page.getByTestId('next').click();

  await page.getByTestId('option-setting-indoor').click();
  await page.getByTestId('next').click();

  await page.getByTestId('option-type-traditional').click();
  await page.getByTestId('next').click();

  await page.getByTestId('option-capacity-4').click();
  await page.getByTestId('next').click();

  await page.getByTestId('option-budget-100000_200000').click();
  await page.getByTestId('next').click();

  await page.getByTestId('option-timeline-now').click();
  await page.getByTestId('next').click();

  // The notes step is optional; skipping it must be allowed.
  await page.getByTestId('next').click();

  await page.getByTestId('input-name').fill('Ana Prueba E2E');
  await page.getByTestId('input-email').fill(CONSUMER_EMAIL);
  await page.getByTestId('input-phone').fill('5512345678');
  await page.getByTestId('next').click();

  await page.getByTestId('input-consent').check();
  await page.getByTestId('submit').click();

  await expect(page).toHaveURL(/\/gracias/);
  await expect(page.getByTestId('confirmation')).toBeVisible();
});

test('the questionnaire refuses to advance without a required answer', async ({ page }) => {
  await page.goto('/cotizar');
  await page.getByTestId('next').click();
  await expect(page.getByTestId('form-error')).toBeVisible();
});

test('operator qualifies the lead and assigns one provider', async ({ page }) => {
  await signIn(page, 'operator@example.com', '/ops');
  await expect(page).toHaveURL(/\/ops/);

  // Newest lead first.
  await page.getByTestId('lead-rows').locator('tr').first().getByText('Abrir').click();
  await expect(page.getByTestId('qualification')).toBeVisible();

  await page.getByTestId('qualify-lead').click();

  // The assignment form only appears once the lead is qualified. Waiting for it
  // matters: clearing checkboxes before it renders would leave the engine's
  // pre-selected recommendations checked.
  await expect(page.getByTestId('assign-submit')).toBeVisible();

  // Pick a named provider rather than whatever ranked first, so the next test
  // knows which account to sign in as.
  const checkboxes = page.locator('form input[type="checkbox"][name="providerCompanyId"]');
  const count = await checkboxes.count();
  for (let index = 0; index < count; index += 1) await checkboxes.nth(index).uncheck();

  await page.locator('label', { hasText: 'Nordic Sauna CDMX' }).locator('input[type="checkbox"]').check();
  await page.getByTestId('assign-submit').click();

  await expect(page.getByTestId('assign-success')).toBeVisible();
  await expect(page.getByTestId('assignments')).toContainText('Nordic Sauna CDMX');
});

test('provider sees the assignment, gets contact details only after accepting, then quotes', async ({ page }) => {
  await signIn(page, 'owner.nordic@example.com', '/portal');
  await expect(page).toHaveURL(/\/portal/);

  await page.getByTestId('assignment-list').getByText('Ver').first().click();

  // Consumer contact is withheld until the provider commits to the project.
  await expect(page.getByTestId('contact-hidden')).toBeVisible();
  await expect(page.getByTestId('consumer-contact')).toHaveCount(0);

  await page.getByTestId('accept-assignment').click();
  await expect(page.getByTestId('assignment-status')).toContainText('accepted');
  await expect(page.getByTestId('consumer-contact')).toContainText(CONSUMER_EMAIL);

  await page.getByTestId('quote-amount').fill('123456.78');
  await page.getByTestId('submit-quote').click();
  await expect(page.getByTestId('quotes')).toContainText('123,456.78 MXN');
});

test('a provider cannot reach another company portal data', async ({ page }) => {
  await signIn(page, 'owner.valle@example.com', '/portal');
  // Pérgolas del Valle participates in a different marketplace, so it sees
  // nothing on this host even though assignments exist in the database.
  await expect(page.getByText('Todavía no tienes proyectos asignados')).toBeVisible();
});

test('the company owner edits its own coverage, and a team member cannot', async ({ page }) => {
  await signIn(page, 'member.nordic@example.com', '/portal/cobertura');
  // A team member sees the coverage but gets no form to change it.
  await expect(page.getByTestId('coverage-readonly')).toContainText('traditional');
  await expect(page.getByTestId('coverage-save')).toHaveCount(0);

  await signIn(page, 'owner.nordic@example.com', '/portal/cobertura');
  await expect(page.getByTestId('coverage-postal-prefixes')).toHaveValue('01, 03, 05, 11');

  // A postal prefix the marketplace would accept but the form must not.
  await page.getByTestId('coverage-postal-prefixes').fill('01, CDMX');
  await page.getByTestId('coverage-save').click();
  await expect(page.getByTestId('coverage-error')).toContainText('postal prefix');

  await page.getByTestId('coverage-postal-prefixes').fill('01, 03, 07');
  await page.getByTestId('coverage-service-steam').check();
  await page.getByTestId('coverage-min-steam').fill('90000');
  await page.getByTestId('coverage-save').click();
  await expect(page.getByTestId('coverage-message')).toContainText('3 servicio(s), 3 código(s) postal(es)');

  // Persisted, not just echoed back.
  await page.reload();
  await expect(page.getByTestId('coverage-postal-prefixes')).toHaveValue('01, 03, 07');
  await expect(page.getByTestId('coverage-service-steam')).toBeChecked();
  await expect(page.getByTestId('coverage-min-steam')).toHaveValue('90000');
});

test('the portals are never indexable', async ({ page }) => {
  for (const path of ['/ops', '/portal', '/portal/cobertura', '/cotizar', '/entrar']) {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots ?? '').toContain('noindex');
  }
});
