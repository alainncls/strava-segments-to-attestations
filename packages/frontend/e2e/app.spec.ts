import { expect, type Page, test } from '@playwright/test';

interface RuntimeMonitor {
  assertClean: () => void;
}

function monitorRuntime(page: Page): RuntimeMonitor {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const assetFailures: string[] = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    const resourceType = request.resourceType();

    if (
      url.origin !== 'http://127.0.0.1:4177' ||
      !['font', 'image', 'script', 'stylesheet'].includes(resourceType)
    ) {
      return;
    }

    assetFailures.push(`${resourceType} ${request.url()} ${request.failure()?.errorText}`);
  });

  return {
    assertClean: (): void => {
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(assetFailures).toEqual([]);
    },
  };
}

test('renders the production home page without a blank root', async ({ page }) => {
  const runtime = monitorRuntime(page);

  await page.goto('/');

  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByRole('link', { name: /segment attestations/i })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /create verifiable attestations/i }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /connect with strava/i })).toBeVisible();

  runtime.assertClean();
});

test('renders the about route from the production build', async ({ page }) => {
  const runtime = monitorRuntime(page);

  await page.goto('/about');

  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByRole('heading', { name: /about segment attestations/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /get started/i })).toBeVisible();

  runtime.assertClean();
});

test('renders the OAuth error state instead of crashing', async ({ page }) => {
  const runtime = monitorRuntime(page);

  await page.goto('/oauth');

  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByRole('heading', { name: /authentication error/i })).toBeVisible();
  await expect(page.getByText(/no authorization code received/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /back to home/i })).toBeVisible();

  runtime.assertClean();
});
