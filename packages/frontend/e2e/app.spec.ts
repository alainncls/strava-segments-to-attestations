import { expect, type Page, test } from '@playwright/test';

interface RuntimeMonitor {
  assertClean: (expectedConsoleErrors?: RegExp[]) => void;
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
    assertClean: (expectedConsoleErrors: RegExp[] = []): void => {
      expect(pageErrors).toEqual([]);
      expect(
        consoleErrors.filter(
          (message) => !expectedConsoleErrors.some((pattern) => pattern.test(message)),
        ),
      ).toEqual([]);
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
  await expect(page.getByText(/invalid authorization state/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /back to home/i })).toBeVisible();

  runtime.assertClean();
});

test('activity pagination retries the same page, honors 429 cooldown, and remains usable on mobile', async ({
  page,
}) => {
  const runtime = monitorRuntime(page);
  const requestedPages: string[] = [];
  let pageOneAttempts = 0;
  let pageTwoAttempts = 0;

  await page.addInitScript(() => {
    sessionStorage.setItem('strava_access_token', 'fixture-token');
    sessionStorage.setItem('strava_expires_at', String(Math.floor(Date.now() / 1000) + 3600));
    sessionStorage.setItem('strava_athlete', JSON.stringify({ id: 123, firstname: 'Fixture' }));
  });
  await page.route('https://www.strava.com/api/v3/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/athlete/activities')) {
      const requestedPage = url.searchParams.get('page') ?? '';
      requestedPages.push(requestedPage);
      if (requestedPage === '1') {
        pageOneAttempts += 1;
        if (pageOneAttempts === 1) {
          await route.fulfill({ status: 503, json: { message: 'temporary failure' } });
        } else {
          await route.fulfill({
            status: 200,
            json: Array.from({ length: 30 }, (_, index) => ({
              id: index + 1,
              name: `Activity ${index + 1}`,
              type: 'Ride',
              start_date: '2026-01-01T10:00:00Z',
              distance: 1000,
            })),
          });
        }
      } else {
        pageTwoAttempts += 1;
        if (pageTwoAttempts === 1) {
          await route.fulfill({
            status: 429,
            headers: {
              'Retry-After': '2',
              'Access-Control-Expose-Headers': 'Retry-After',
            },
            json: { message: 'rate limited' },
          });
        } else {
          await route.fulfill({
            status: 200,
            json: [
              {
                id: 31,
                name: 'Activity 31',
                type: 'Ride',
                start_date: '2026-01-01T10:00:00Z',
                distance: 1000,
              },
            ],
          });
        }
      }
      return;
    }

    await route.fulfill({ status: 200, json: { segment_efforts: [] } });
  });

  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('page 1');
  await page.getByRole('button', { name: 'Retry activities' }).click();
  await expect(page.getByRole('button', { name: /Ride Activity 1 Thu/ }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Load more activities' }).click();
  const waitButton = page.getByRole('button', { name: 'Wait before retrying' });
  await expect(waitButton).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('HTTP 429');

  const retryButton = page.getByRole('button', { name: 'Retry activities' });
  await expect(retryButton).toBeEnabled({ timeout: 5000 });
  await retryButton.click();
  await expect(page.getByRole('button', { name: /Activity 31/ })).toBeVisible();
  expect(requestedPages).toEqual(['1', '1', '2', '2']);

  runtime.assertClean([/status of 503/, /status of 429/]);
});
