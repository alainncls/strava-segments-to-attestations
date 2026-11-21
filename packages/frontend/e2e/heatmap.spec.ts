import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The wallet code is about 2.9 MB: the heatmap must not load it.
const MAX_SCRIPT_BYTES = 400_000;

// Same weekday, one week apart: ArrowLeft moves from one to the other in any year.
const year = new Date().getFullYear();
const runDay = `${year}-01-02`;
const rideDay = `${year}-01-09`;
const activities = [
  { id: 11, name: 'New Year Run', sport_type: 'Run', day: runDay, distance: 10_000, time: 3000 },
  { id: 12, name: 'Second Run', sport_type: 'Run', day: runDay, distance: 5_000, time: 1500 },
  {
    id: 13,
    name: 'Gravel Ride',
    sport_type: 'GravelRide',
    day: rideDay,
    distance: 40_000,
    time: 7200,
  },
].map(({ day, time, ...a }) => ({ ...a, start_date_local: `${day}T07:30:00Z`, moving_time: time }));

test('syncs, filters, opens a day and passes an accessibility check', async ({ page }) => {
  const scripts: number[] = [];
  const pages: string[] = [];
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'script') {
      scripts.push((await response.body().catch(() => Buffer.alloc(0))).length);
    }
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('strava_access_token', 'fixture-token');
    sessionStorage.setItem('strava_expires_at', String(Math.floor(Date.now() / 1000) + 3600));
    sessionStorage.setItem('strava_athlete', JSON.stringify({ id: 123, firstname: 'Fixture' }));
  });
  await page.route('https://www.strava.com/api/v3/athlete/activities**', async (route) => {
    const requested = new URL(route.request().url()).searchParams.get('page') ?? '';
    pages.push(requested);
    await route.fulfill({ json: requested === '1' ? activities : [] });
  });

  await page.goto('/heatmap');
  await expect(page.getByRole('heading', { name: 'Activity heatmap' })).toBeVisible();
  await expect(page.getByText(/^3 activities, full sync/)).toBeVisible();
  expect(pages).toEqual(['1', '2']);
  // One full sync each day: the button waits for tomorrow.
  await expect(page.getByRole('button', { name: /^Full sync after/ })).toBeDisabled();

  const grid = page.locator(`svg[data-year="${year}"]`);
  await expect(grid.getByText('3 activities, 55 km, 3.3 h')).toBeVisible();

  await page.getByLabel('Sport').selectOption('GravelRide');
  await expect(grid.getByText('1 activity, 40 km, 2 h')).toBeVisible();
  await page.getByLabel('Sport').selectOption('');

  // Settings stay closed until asked for.
  const fromThreshold = page.getByLabel(/^Shade 1: from/);
  await expect(fromThreshold).toBeHidden();
  await page.getByRole('button', { name: 'Customize' }).click();
  await expect(page.getByRole('button', { name: 'Customize' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  // A day below the first value stays empty: 40 km keeps only the ride.
  const colored = grid.locator('rect:not([data-level="0"])');
  await expect(colored).toHaveCount(2);
  await fromThreshold.fill('40');
  await expect(colored).toHaveCount(1);
  await fromThreshold.fill('0');
  await page.getByRole('button', { name: 'Customize' }).click();

  // On a phone the grid fits the screen width and the size control is hidden.
  if (test.info().project.name === 'chromium') {
    const width = Number(await grid.getAttribute('width'));
    await page.getByRole('radio', { name: 'S', exact: true }).check({ force: true });
    await expect.poll(async () => Number(await grid.getAttribute('width'))).toBeLessThan(width);
    await page.getByRole('radio', { name: 'M', exact: true }).check({ force: true });
  }

  // Export opens above the grids.
  await page.getByRole('button', { name: 'Export' }).click();
  const png = page.getByRole('button', { name: 'Download PNG' });
  await expect(png).toBeVisible();
  expect((await png.boundingBox())!.y).toBeLessThan((await grid.boundingBox())!.y);
  await page.getByRole('button', { name: 'Export' }).click();

  // Keyboard: move one week back, open the day, close it.
  const firstDay = grid.locator(`rect[data-day="${runDay}"]`);
  await grid.locator(`rect[data-day="${rideDay}"]`).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowLeft');
  await expect(firstDay).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('New Year Run');
  await expect(dialog).toContainText('15.00 km');
  await expect(dialog.getByRole('link', { name: 'View on Strava' }).first()).toHaveAttribute(
    'href',
    'https://www.strava.com/activities/11',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(firstDay).toBeFocused();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  expect(scripts.reduce((sum, size) => sum + size, 0)).toBeLessThan(MAX_SCRIPT_BYTES);
});

test('loads the heatmap route directly with and without the last slash', async ({ page }) => {
  for (const path of ['/heatmap', '/heatmap/']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('button', { name: /connect with strava/i })).toBeVisible();
  }
});
