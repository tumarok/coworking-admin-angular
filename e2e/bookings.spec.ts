import { dayFirst, daysFromToday, expect, test } from './fixtures';
import { BookingDetailsPage } from './pages/booking-details-page';
import { BookingsPage } from './pages/bookings-page';
import { MemberDetailsPage } from './pages/member-details-page';
import { Notifications } from './pages/notifications';
import type { ApiClient } from './support/api-client';
import { createBooking, createLocation, createMember, createRoom } from './support/data';

/** A location with one room and two members: what a booking needs. */
async function setUp(api: ApiClient) {
  const location = await createLocation(api, { name: 'Rules Hub' });
  const room = await createRoom(api, location.id, { name: 'Onyx', hourlyRate: 2500 });
  const dana = await createMember(api);
  const rita = await createMember(api, {
    firstName: 'Rita',
    lastName: 'Rules',
    email: 'rita.rules@example.com',
  });
  return { location, room, dana, rita };
}

test.describe('booking details', () => {
  test('moves a booking from pending to completed', async ({ signedInPage: page, api }) => {
    const { room, dana } = await setUp(api);
    const booking = await createBooking(api, {
      roomId: room.id,
      memberId: dana.id,
      day: daysFromToday(10),
    });
    const details = new BookingDetailsPage(page);
    const notifications = new Notifications(page);
    await details.goto(booking.id);

    await expect(details.status('Pending')).toBeVisible();
    await expect(details.move('Confirm')).toBeVisible();
    await expect(details.move('Check in')).toHaveCount(0);

    await details.move('Confirm').click();
    await notifications.expectMessage('Booking confirmed');
    await expect(details.status('Confirmed')).toBeVisible();
    await expect(details.move('Check in')).toBeVisible();
    await expect(details.move('No-show')).toBeVisible();
    await expect(details.move('Cancel booking')).toBeVisible();

    await details.move('Check in').click();
    await notifications.expectMessage('Booking checked in');
    await expect(details.status('Checked in')).toBeVisible();
    // Once the booking has started, it cannot be edited or called off.
    await expect(details.edit).toHaveCount(0);
    await expect(details.move('Cancel booking')).toHaveCount(0);

    await details.move('Complete').click();
    await notifications.expectMessage('Booking completed');
    await expect(details.status('Completed')).toBeVisible();
    await expect(details.move('Complete')).toHaveCount(0);
  });

  test('asks before cancelling, and cancels for good', async ({ signedInPage: page, api }) => {
    const { room, dana } = await setUp(api);
    const booking = await createBooking(api, {
      roomId: room.id,
      memberId: dana.id,
      day: daysFromToday(10),
    });
    const details = new BookingDetailsPage(page);
    await details.goto(booking.id);

    const question = await details.askToCancel();
    await question.decline('Keep');
    await expect(details.status('Pending')).toBeVisible();

    await details.cancelBooking();

    await new Notifications(page).expectMessage('Booking cancelled');
    await expect(details.status('Cancelled')).toBeVisible();
    await expect(details.edit).toHaveCount(0);
    await expect(details.move('Confirm')).toHaveCount(0);
  });

  test('refuses a move the booking has outgrown, with the reason in a snack bar', async ({
    signedInPage: page,
    api,
  }) => {
    const { room, dana } = await setUp(api);
    const booking = await createBooking(api, {
      roomId: room.id,
      memberId: dana.id,
      day: daysFromToday(10),
    });
    const details = new BookingDetailsPage(page);
    await details.goto(booking.id);
    await expect(details.move('Confirm')).toBeVisible();

    // Somebody else cancels it while this page still offers "Confirm".
    await api.post(`/bookings/${booking.id}/status`, { status: 'cancelled' });
    await details.move('Confirm').click();

    await new Notifications(page).expectMessage('Cannot change status from cancelled to confirmed');
    await expect(details.status('Pending')).toBeVisible();
  });

  test('edits the booking: the room, the hours, the people and a note', async ({
    signedInPage: page,
    api,
  }) => {
    const { room, dana } = await setUp(api);
    const booking = await createBooking(api, {
      roomId: room.id,
      memberId: dana.id,
      day: daysFromToday(25),
    });
    const details = new BookingDetailsPage(page);
    await details.goto(booking.id);
    await expect(details.facts.value('Duration')).toHaveText('1 h');

    const form = await details.openEditForm();
    await expect(form.room).toHaveValue(/^Onyx · Rules Hub/);
    await expect(form.member).toHaveValue(/^Dana Testova/);
    await expect(form.save).toBeDisabled();
    await form.fill({ from: '13:00', to: '15:30', attendees: 4, notes: 'Projector, please' });
    await form.submitAndClose();

    await new Notifications(page).expectMessage(/Booking updated: Onyx, .*13:00–15:30/);
    await expect(details.facts.value('Starts')).toHaveText(/, 13:00\s*$/);
    await expect(details.facts.value('Ends')).toHaveText(/, 15:30\s*$/);
    await expect(details.facts.value('Duration')).toHaveText('2.5 h');
    await expect(details.facts.value('Price')).toHaveText('€62.50');
    await expect(details.facts.value('Attendees')).toHaveText('4');
    await expect(details.facts.value('Notes')).toHaveText('Projector, please');
  });
});

test.describe('bookings list', () => {
  test('narrows the list by search, status and day, all in the address', async ({
    signedInPage: page,
    api,
  }) => {
    const { room, dana, rita } = await setUp(api);
    await createBooking(api, { roomId: room.id, memberId: dana.id, day: daysFromToday(50) });
    await createBooking(api, {
      roomId: room.id,
      memberId: rita.id,
      day: daysFromToday(60),
      status: 'confirmed',
    });
    const bookings = new BookingsPage(page);
    await bookings.goto(`?roomId=${room.id}`);
    await bookings.table.expectRows(2);

    await bookings.toolbar.search.fill('Rita');
    await expect(page).toHaveURL(/q=Rita/);
    await bookings.table.expectRows(1);
    await expect(bookings.table.row('Rita Rules')).toBeVisible();

    await bookings.toolbar.search.clear();
    await bookings.table.expectRows(2);

    await bookings.toolbar.choose('Status', 'Confirmed');
    await expect(page).toHaveURL(/status=confirmed/);
    await bookings.table.expectRows(1);
    await expect(bookings.table.row('Rita Rules')).toBeVisible();

    await bookings.toolbar.choose('Status', 'Any status');
    await expect(page).not.toHaveURL(/status=/);
    await bookings.table.expectRows(2);

    // A day typed into "From date" keeps the bookings that start on it or later.
    await bookings.fromDate.fill(dayFirst(daysFromToday(55)));
    await expect(page).toHaveURL(new RegExp(`from=${daysFromToday(55)}`));
    await bookings.table.expectRows(1);
    await expect(bookings.table.row('Rita Rules')).toBeVisible();
  });

  test('shows the bookings of one member from the member page, as a chip that can be taken off', async ({
    signedInPage: page,
    api,
  }) => {
    const { room, dana, rita } = await setUp(api);
    await createBooking(api, { roomId: room.id, memberId: dana.id, day: daysFromToday(50) });
    await createBooking(api, { roomId: room.id, memberId: rita.id, day: daysFromToday(51) });
    await createBooking(api, { roomId: room.id, memberId: rita.id, day: daysFromToday(52) });
    const member = new MemberDetailsPage(page, 'Rita Rules');
    const bookings = new BookingsPage(page);
    await member.goto(rita.id);

    await member.viewBookings.click();

    await expect(page).toHaveURL(new RegExp(`/bookings\\?memberId=${rita.id}$`));
    await expect(bookings.toolbar.chip('Member: Rita Rules')).toBeVisible();
    await expect(bookings.table.range).toHaveText('1 – 2 of 2');
    await expect(bookings.table.rows.filter({ hasNotText: 'Rita Rules' })).toHaveCount(0);
    await expect(bookings.toolbar.clearFilters).toBeVisible();

    await bookings.toolbar.removeChip('Member: Rita Rules');

    await expect(bookings.toolbar.chips).toHaveCount(0);
    await expect(page).not.toHaveURL(/memberId=/);
    await expect(bookings.toolbar.search).toBeFocused();
    // Every booking of the system is back, among them Dana's.
    await expect(bookings.table.row('Dana Testova')).toBeVisible();
  });
});
