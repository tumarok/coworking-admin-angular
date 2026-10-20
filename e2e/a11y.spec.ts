import { daysFromToday, expect, test } from './fixtures';
import { BookingDetailsPage } from './pages/booking-details-page';
import { BookingsPage } from './pages/bookings-page';
import { DashboardPage } from './pages/dashboard-page';
import { LocationDetailsPage } from './pages/location-details-page';
import { LocationsPage } from './pages/locations-page';
import { LoginPage } from './pages/login-page';
import { MemberDetailsPage } from './pages/member-details-page';
import { MembersPage } from './pages/members-page';
import { NotFoundPage } from './pages/not-found-page';
import { RoomDetailsPage } from './pages/room-details-page';
import { RoomsPage } from './pages/rooms-page';
import { expectAccessible } from './support/a11y';
import type { ApiClient } from './support/api-client';
import { createLocation, createMember, createRoom } from './support/data';

/** The first record the seeded API lists for a collection. */
async function firstOf(api: ApiClient, collection: string) {
  const { items } = await api.get<{
    items: {
      id: string;
      memberId?: string;
      name?: string;
      firstName?: string;
      lastName?: string;
    }[];
  }>(`/${collection}`, { limit: 1 });
  const [record] = items;
  if (!record) throw new Error(`The seeded ${collection} are empty`);
  return record;
}

test.describe('accessibility @a11y', () => {
  test('the sign-in page', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.heading).toBeVisible();

    await expectAccessible(page);
  });

  test('the sign-in page with a refusal', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn('admin@coworking.test', 'wrong-password');
    await expect(login.failure).toBeVisible();

    await expectAccessible(page);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the dashboard, ${scheme}`, async ({ signedInPage: page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const dashboard = new DashboardPage(page);
      await dashboard.goto();
      await dashboard.expectLoaded();

      await expectAccessible(page);
    });

    test(`the bookings list, ${scheme}`, async ({ signedInPage: page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const bookings = new BookingsPage(page);
      await bookings.goto();
      await bookings.table.expectLoaded();

      await expectAccessible(page);
    });

    test(`the booking form, ${scheme}`, async ({ signedInPage: page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const bookings = new BookingsPage(page);
      await bookings.goto();
      await bookings.table.expectLoaded();
      const form = await bookings.openNewBookingForm();
      await expect(form.room).toBeFocused();

      await expectAccessible(page);
    });
  }

  test('the bookings list with rows ticked and a filter chip', async ({
    signedInPage: page,
    api,
  }) => {
    // A member who certainly has bookings: the owner of the first one.
    const { memberId } = await firstOf(api, 'bookings');
    const bookings = new BookingsPage(page);
    await bookings.goto(`?memberId=${memberId ?? ''}`);
    await bookings.table.expectLoaded();
    await bookings.table.selectAll.check();
    await expect(bookings.selectedCount).toBeVisible();

    await expectAccessible(page);
  });

  test('the booking page', async ({ signedInPage: page, api }) => {
    const booking = await firstOf(api, 'bookings');
    const details = new BookingDetailsPage(page);
    await details.goto(booking.id);
    await expect(details.facts.value('Starts')).toBeVisible();

    await expectAccessible(page);
  });

  test('the booking form refusing an overlap, with the booking in the way named', async ({
    signedInPage: page,
    api,
  }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    await createRoom(api, location.id, { name: 'Onyx' });
    await createMember(api, {
      firstName: 'Rita',
      lastName: 'Rules',
      email: 'rita.rules@example.com',
    });
    const bookings = new BookingsPage(page);
    const slot = {
      room: { search: 'Onyx', option: 'Onyx · Rules Hub' },
      member: { search: 'Rules', option: 'Rita Rules' },
      day: daysFromToday(20),
      from: '12:00',
      to: '13:00',
    };
    await bookings.goto();
    const first = await bookings.openNewBookingForm();
    await first.fill(slot);
    await first.submitAndClose();
    await expect(new BookingDetailsPage(page).heading).toContainText('Onyx');
    await bookings.goto();
    const second = await bookings.openNewBookingForm();
    await second.fill(slot);
    await second.submit();
    await expect(second.banner.getByRole('link')).toBeVisible();

    await expectAccessible(page);
  });

  test('a form showing its field errors', async ({ signedInPage: page }) => {
    const locations = new LocationsPage(page);
    await locations.goto();
    const form = await locations.openNewLocationForm();
    await form.fill({ name: 'A', opensAt: '09:00', closesAt: '08:00' });
    await form.address.click();
    await expect(form.alerts.first()).toBeVisible();

    await expectAccessible(page);
  });

  test('the confirmation before a delete', async ({ signedInPage: page, api }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    const details = new LocationDetailsPage(page, 'Rules Hub');
    await details.goto(location.id);
    await details.askToDelete();

    await expectAccessible(page);
  });

  test('the locations pages', async ({ signedInPage: page, api }) => {
    const locations = new LocationsPage(page);
    await locations.goto();
    await locations.table.expectLoaded();
    await expectAccessible(page);

    const location = await firstOf(api, 'locations');
    await new LocationDetailsPage(page, location.name ?? '').goto(location.id);
    await expectAccessible(page);
  });

  test('the rooms pages', async ({ signedInPage: page, api }) => {
    const rooms = new RoomsPage(page);
    await rooms.goto();
    await rooms.table.expectLoaded();
    await expectAccessible(page);

    const room = await firstOf(api, 'rooms');
    await new RoomDetailsPage(page, room.name ?? '').goto(room.id);
    await expectAccessible(page);
  });

  test('the members pages', async ({ signedInPage: page, api }) => {
    const members = new MembersPage(page);
    await members.goto();
    await members.table.expectLoaded();
    await expectAccessible(page);

    const member = await firstOf(api, 'members');
    await new MemberDetailsPage(page, `${member.firstName} ${member.lastName}`).goto(member.id);
    await expectAccessible(page);
  });

  test('the page for an unknown route', async ({ signedInPage: page }) => {
    await page.goto('/no-such-page');
    await expect(
      new NotFoundPage(page, 'Page not found', 'Back to the dashboard').heading,
    ).toBeVisible();

    await expectAccessible(page);
  });

  test('the page for a booking that does not exist', async ({ signedInPage: page }) => {
    await page.goto('/bookings/bk_missing');
    await expect(new NotFoundPage(page, 'Booking not found', 'All bookings').heading).toBeVisible();

    await expectAccessible(page);
  });
});
