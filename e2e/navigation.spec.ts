import { expect, test } from './fixtures';
import { AppShell } from './pages/app-shell';
import { DashboardPage } from './pages/dashboard-page';
import { NotFoundPage } from './pages/not-found-page';
import { RoomsPage } from './pages/rooms-page';

test.describe('navigation', () => {
  test('shows the dashboard with the figures the API reports', async ({
    signedInPage: page,
    api,
  }) => {
    const { kpis, byStatus } = await api.get<{
      kpis: { bookingsToday: number; activeMembers: number };
      byStatus: Record<string, number>;
    }>('/dashboard');
    const dashboard = new DashboardPage(page);

    await dashboard.goto();
    await dashboard.expectLoaded();

    await expect(page).toHaveTitle('Dashboard · Coworking Admin');
    await expect(
      dashboard.occupancy.getByRole('heading', { name: 'Occupancy by location' }),
    ).toBeVisible();
    await dashboard.expectFigure('Bookings', String(kpis.bookingsToday));
    await dashboard.expectFigure('Active members', String(kpis.activeMembers));
    await dashboard.expectStatusCount('Completed', byStatus['completed'] ?? 0);
    await expect(dashboard.upcoming.getByRole('link', { name: 'All bookings' })).toBeVisible();
  });

  test('moves between the sections and marks the current one', async ({ signedInPage: page }) => {
    const shell = new AppShell(page);
    await page.goto('/');

    for (const section of ['Locations', 'Rooms', 'Members', 'Bookings'] as const) {
      await shell.open(section);
      await expect(page.getByRole('heading', { name: section, level: 1 })).toBeVisible();
      await expect(page).toHaveTitle(`${section} · Coworking Admin`);
      await shell.expectCurrent(section);
    }
    await shell.open('Dashboard');
    await shell.expectCurrent('Dashboard');
  });

  test('keeps the list filters in the URL, and in the page after a reload', async ({
    signedInPage: page,
    api,
  }) => {
    const {
      items: [room],
    } = await api.get<{ items: { name: string }[] }>('/rooms', { limit: 1 });
    if (!room) throw new Error('The seed has no rooms');
    const needle = room.name.toLowerCase();
    const rooms = new RoomsPage(page);
    await rooms.goto();

    await rooms.toolbar.search.fill(needle);
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === needle);
    await expect(rooms.table.rows.first()).toContainText(room.name);
    await expect(rooms.table.rows.filter({ hasNotText: room.name })).toHaveCount(0);

    await rooms.toolbar.choose('Status', 'Available');
    await expect(page).toHaveURL(/status=available/);

    await page.reload();
    await expect(rooms.toolbar.search).toHaveValue(needle);
    await expect(rooms.toolbar.filter('Status')).toHaveText('Available');
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === needle);

    await rooms.toolbar.clearFilters.click();
    await expect(page).toHaveURL(/\/rooms$/);
    await expect(rooms.toolbar.search).toHaveValue('');
  });

  test('shows a not-found page for an unknown route', async ({ signedInPage: page }) => {
    await page.goto('/no-such-page');

    const notFound = new NotFoundPage(page, 'Page not found', 'Back to the dashboard');
    await expect(notFound.heading).toBeVisible();
    await notFound.link.click();
    await expect(new DashboardPage(page).heading).toBeVisible();
  });

  test('shows a not-found page for a record that does not exist', async ({
    signedInPage: page,
  }) => {
    await page.goto('/bookings/bk_missing');

    const notFound = new NotFoundPage(page, 'Booking not found', 'All bookings');
    await expect(notFound.heading).toBeVisible();
    await notFound.link.click();
    await expect(page).toHaveURL(/\/bookings$/);
  });
});
