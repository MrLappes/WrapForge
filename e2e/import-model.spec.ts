import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Manual verification harness for the generic-model import pipeline. It is not
 * part of the default CI run because it needs a local car model and a GPU or
 * SwiftShader:
 *
 *   WRAPFORGE_TEST_MODEL=/path/to/car.glb npx playwright test e2e/import-model.spec.ts
 */
const modelPath = process.env.WRAPFORGE_TEST_MODEL ?? '';

test('imports a real glTF car, detects panels and paints a livery', async ({ page }) => {
  test.skip(!modelPath || !existsSync(modelPath), 'Set WRAPFORGE_TEST_MODEL to a .glb file');

  await page.goto('/');
  await page.getByLabel('Project name').fill('Leapmotor import');
  await page.getByRole('button', { name: 'Create project' }).last().click();
  await expect(page.getByRole('button', { name: 'Import 3D model' }).first()).toBeVisible({
    timeout: 30_000,
  });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import 3D model' }).first().click(),
  ]);
  await chooser.setFiles(modelPath);

  await expect(page.getByText(/panels detected/i)).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.viewport canvas')).toBeVisible();

  await page.getByRole('tab', { name: 'Panels' }).click();
  const panelCount = await page.locator('.panel-chip').count();
  console.log('Panel chips:', panelCount);
  expect(panelCount).toBeGreaterThan(4);

  // Correct a detection: rename, merge, remove, then undo both structural edits.
  await page.locator('.panel-chip').first().click();
  await page.getByLabel('Name', { exact: true }).fill('Test bonnet');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect(page.locator('.panel-chip').first()).toContainText('Test bonnet');

  await page.locator('.panel-chip').nth(1).click();
  await page.getByLabel('Merge into').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Merge', exact: true }).click();
  await expect(page.locator('.panel-chip')).toHaveCount(panelCount - 1);

  await page.locator('.panel-chip').last().click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.panel-chip')).toHaveCount(panelCount - 2);

  await page.keyboard.press('Control+z');
  await expect(page.locator('.panel-chip')).toHaveCount(panelCount - 1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.panel-chip')).toHaveCount(panelCount);

  await page.getByRole('tab', { name: 'Livery' }).click();
  await page.locator('.studio-canvas').screenshot({ path: join('/tmp', 'wrapforge-before.png') });
  await page.getByRole('button', { name: /Kaido Rising/ }).click();
  await page.waitForTimeout(3000);

  const layerCount = await page.locator('.layer-row').count();
  console.log('Livery layers:', layerCount);
  expect(layerCount).toBeGreaterThan(4);

  mkdirSync('docs/screenshots', { recursive: true });
  await page.setViewportSize({ width: 1600, height: 940 });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Capture viewport PNG' }).click();
  await page.screenshot({ path: join('docs/screenshots', 'imported-car-livery.png') });
  await page.locator('.studio-canvas').screenshot({ path: join('/tmp', 'wrapforge-canvas.png') });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export PNG' }).click(),
  ]);
  await download.saveAs('/tmp/wrapforge-livery-export.png');
  console.log('Exported texture:', download.suggestedFilename());
});
