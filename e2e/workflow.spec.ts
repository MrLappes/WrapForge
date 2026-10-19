import { expect, test } from '@playwright/test';

test('create, design, save, and reopen a project in the browser build', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Design the wrap/i)).toBeVisible();

  await page.getByLabel('Project name').fill('E2E Wrap');
  await page.getByRole('button', { name: 'Create project' }).last().click();
  await expect(page.getByRole('heading', { name: 'Vehicle setup' })).toBeVisible();

  const nav = (name: string) =>
    page.locator('.sidebar').getByRole('button', { name: new RegExp(name, 'i') });
  await nav('Vehicle Panels').click();
  await expect(page.getByRole('heading', { name: 'Vehicle panels' })).toBeVisible();
  await page.locator('tbody tr').filter({ hasText: 'Hood' }).first().click();

  await nav('Vector Artwork').click();
  await expect(page.getByRole('heading', { name: 'Vector artwork' })).toBeVisible();
  await page.getByRole('button', { name: 'Velocity stripes' }).click();
  await expect(page.getByText('Velocity Stripes').first()).toBeVisible();

  const place = page.getByRole('button', { name: 'Place on selected panel' });
  await expect(place).toBeEnabled();
  await place.click();

  // Placements live in the studio's Artwork tab now that Livery is the default.
  await page.locator('.inspector-tabs').getByRole('tab', { name: 'Artwork' }).click();
  await expect(page.getByText(/^Placements/)).toBeVisible();
  await expect(page.getByText(/Velocity Stripes on Hood/).first()).toBeVisible();

  await nav('Print Layout').click();
  await expect(page.getByRole('heading', { name: 'Print layout' })).toBeVisible();
  await expect(page.getByText('DRAFT').first()).toBeVisible();

  await page.keyboard.press('Control+s');
  await expect(page.getByText('Project saved').first()).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Design the wrap/i)).toBeVisible();
  await expect(page.locator('.recent-item').filter({ hasText: 'E2E Wrap' })).toBeVisible();
  await page.locator('.recent-item').filter({ hasText: 'E2E Wrap' }).click();
  await page.locator('.inspector-tabs').getByRole('tab', { name: 'Artwork' }).click();
  await expect(page.getByText(/^Placements/)).toBeVisible();
  await expect(page.getByText(/Velocity Stripes on Hood/).first()).toBeVisible();

  await nav('Vector Artwork').click();
  await expect(page.getByText('Velocity Stripes').first()).toBeVisible();
});
