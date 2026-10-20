import { daysFromToday, expect, test } from './fixtures';
import { DashboardPage } from './pages/dashboard-page';
import type { ApiClient } from './support/api-client';

interface DashboardAnswer {
  kpis: { bookingsToday: number; activeMembers: number };
  byStatus: Record<string, number>;
}

const dashboardOf = (api: ApiClient, day: string) =>
  api.get<DashboardAnswer>('/dashboard', { date: day });

test.describe('dashboard', () => {
  test('shows the figures of the day in the address', async ({ signedInPage: page, api }) => {
    const day = daysFromToday(-3);
    const { kpis, byStatus } = await dashboardOf(api, day);
    const dashboard = new DashboardPage(page);

    await dashboard.goto(day);
    await dashboard.expectLoaded();

    await expect(page).toHaveURL(new RegExp(`date=${day}`));
    await expect(dashboard.dateBox).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);
    await dashboard.expectFigure('Bookings', String(kpis.bookingsToday));
    await dashboard.expectFigure('Active members', String(kpis.activeMembers));
    for (const [status, label] of [
      ['completed', 'Completed'],
      ['cancelled', 'Cancelled'],
      ['no_show', 'No show'],
    ] as const) {
      await dashboard.expectStatusCount(label, byStatus[status] ?? 0);
    }
  });

  test('moves to another day when one is typed, and back to today when it is cleared', async ({
    signedInPage: page,
    api,
  }) => {
    const today = await dashboardOf(api, daysFromToday(0));
    const earlier = daysFromToday(-5);
    const before = await dashboardOf(api, earlier);
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    await expect(page).not.toHaveURL(/date=/);
    await dashboard.expectFigure('Bookings', String(today.kpis.bookingsToday));

    await dashboard.showDay(earlier);

    await expect(page).toHaveURL(new RegExp(`date=${earlier}`));
    await dashboard.expectFigure('Bookings', String(before.kpis.bookingsToday));
    await dashboard.expectStatusCount('Completed', before.byStatus['completed'] ?? 0);

    await dashboard.dateBox.clear();
    await dashboard.dateBox.blur();

    await expect(page).not.toHaveURL(/date=/);
    await dashboard.expectFigure('Bookings', String(today.kpis.bookingsToday));
  });

  test('links from the figures to the records they name', async ({ signedInPage: page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();

    await dashboard.occupancy.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/locations\/loc_\w+$/);

    await page.goBack();
    await dashboard.expectLoaded();
    const upcoming = dashboard.upcoming.getByRole('list').getByRole('link').first();
    await upcoming.click();
    await expect(page).toHaveURL(/\/bookings\/bk_\w+$/);
  });
});
