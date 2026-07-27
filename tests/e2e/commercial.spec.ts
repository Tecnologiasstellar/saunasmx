import { expect, test, type Page } from '@playwright/test';

/**
 * Commercial gate — COM-001, plans and agreements.
 *
 * Proves the acceptance criterion through the operator's own screen: the terms
 * an agreement was signed with survive a later edit to the plan.
 */

async function signInAsOperator(page: Page) {
  await page.goto('/entrar?next=%2Fops%2Fplanes');
  await page.getByTestId('login-email').fill('operator@example.com');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('dev-login-link').click();
  await expect(page).toHaveURL(/\/ops\/planes/);
}

test.describe.configure({ mode: 'serial' });

test('an operator signs a provider onto a plan and sees the terms', async ({ page }) => {
  await signInAsOperator(page);

  // Two plans are seeded; every provider starts on the free pilot.
  await expect(page.getByTestId('plan-list')).toContainText('Piloto — sin cuota');
  await expect(page.getByTestId('plan-list')).toContainText('Crecimiento — comisión por venta');

  const nordic = page.getByTestId('agreement-list').locator('li', { hasText: 'Nordic Sauna CDMX' });
  await expect(nordic).toContainText('Sin costo');

  await nordic.getByRole('combobox', { name: 'Plan' }).selectOption({ label: 'Crecimiento — comisión por venta' });
  await nordic.getByRole('button', { name: 'Aplicar' }).click();

  await expect(nordic).toContainText('Por lead calificado');
  await expect(nordic).toContainText('Comisión por éxito 3%');
  // The derived commission agreements are visible, not just the headline terms.
  await expect(nordic).toContainText('venta verificada');
});

test('editing the plan afterwards does not rewrite the signed agreement', async ({ page }) => {
  await signInAsOperator(page);

  const growth = page.getByTestId('plan-list').locator('li', { hasText: 'Crecimiento — comisión por venta' });
  await growth.getByRole('group').getByText('Editar términos').click();
  await growth.getByRole('spinbutton', { name: /Comisión por éxito/ }).fill('15');
  await growth.getByRole('button', { name: 'Guardar términos' }).click();
  await expect(growth).toContainText('Comisión por éxito 15%');

  // The provider signed at 3% and stays at 3%.
  const nordic = page.getByTestId('agreement-list').locator('li', { hasText: 'Nordic Sauna CDMX' });
  await expect(nordic).toContainText('Comisión por éxito 3%');
  await expect(nordic).not.toContainText('Comisión por éxito 15%');
});

test('a provider portal user cannot reach the commercial screen', async ({ page }) => {
  await page.goto('/entrar?next=%2Fops%2Fplanes');
  await page.getByTestId('login-email').fill('owner.nordic@example.com');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('dev-login-link').click();
  await expect(page).toHaveURL(/error=forbidden/);
});
