import { expect, test } from '@playwright/test';

test('dashboard loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('maps nav is available', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Maps', exact: true })
  ).toBeVisible();
});
