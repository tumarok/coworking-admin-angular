import { daysFromToday, expect, test } from './fixtures';
import { BookingDetailsPage } from './pages/booking-details-page';
import { BookingsPage } from './pages/bookings-page';
import { BulkResultDialog } from './pages/bulk-result-dialog';
import { Notifications } from './pages/notifications';
import { createBooking, createLocation, createMember, createRoom } from './support/data';

test.describe('booking rules', () => {
  test('refuses an overlapping booking, names the one in the way and keeps the form open', async ({
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
    const day = daysFromToday(20);
    const bookings = new BookingsPage(page);
    const details = new BookingDetailsPage(page);
    const notifications = new Notifications(page);
    const slot = {
      room: { search: 'Onyx', option: 'Onyx · Rules Hub' },
      member: { search: 'Rules', option: 'Rita Rules' },
      day,
    };

    // The first booking takes the room from 12:00 to 13:00.
    await bookings.goto();
    const first = await bookings.openNewBookingForm();
    await first.fill({ ...slot, from: '12:00', to: '13:00' });
    await first.submitAndClose();
    await notifications.expectMessage('Booking created: Onyx');
    await expect(page).toHaveURL(/\/bookings\/bk_\w+$/);
    const takenId = /\/bookings\/(bk_\w+)$/.exec(page.url())?.[1];
    if (!takenId) throw new Error(`The new booking has no id in its address: ${page.url()}`);

    // A second one for the same room overlaps it.
    await bookings.goto();
    const second = await bookings.openNewBookingForm();
    await second.fill({ ...slot, from: '12:30', to: '13:30' });
    await second.submit();

    await expect(second.banner).toContainText('The room is already booked for this time.');
    const inTheWay = second.banner.getByRole('link', { name: /12:00–13:00/ });
    await expect(inTheWay).toHaveAttribute('href', `/bookings/${takenId}`);
    await expect(inTheWay).toHaveAttribute('target', '_blank');
    await expect(second.dialog).toBeVisible();
    // A refusal of the whole attempt does not lock the form: Save stays available.
    await expect(second.save).toBeEnabled();

    // Moving to a free hour clears the refusal and the booking goes through.
    await second.fill({ from: '14:00', to: '15:00' });
    await expect(second.banner).toHaveCount(0);
    await second.submitAndClose();
    await expect(details.heading).toContainText('Onyx');
    await expect(details.facts.value('Starts')).toHaveText(/, 14:00\s*$/);
  });

  test('tells which field the server refused: a time outside the opening hours', async ({
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
    await bookings.goto();

    const form = await bookings.openNewBookingForm();
    await form.fill({
      room: { search: 'Onyx', option: 'Onyx · Rules Hub' },
      member: { search: 'Rules', option: 'Rita Rules' },
      day: daysFromToday(21),
      from: '06:00',
      to: '07:00',
    });
    await form.submit();

    await expect(form.alert('Outside opening hours (08:00–20:00 local time)')).toBeVisible();
    await expect(form.dialog).toBeVisible();
    // The refusal belongs to the field, which Save waits on until it is edited.
    await expect(form.save).toBeDisabled();
    await form.fill({ from: '08:00', to: '09:00' });
    await expect(form.save).toBeEnabled();
  });

  test('checks the form before sending it: attendees against the room, the end against the start', async ({
    signedInPage: page,
    api,
  }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    await createRoom(api, location.id, { name: 'Onyx', capacity: 4 });
    await createMember(api, {
      firstName: 'Rita',
      lastName: 'Rules',
      email: 'rita.rules@example.com',
    });
    const bookings = new BookingsPage(page);
    await bookings.goto();

    const form = await bookings.openNewBookingForm();
    await expect(form.save).toBeDisabled();
    await form.fill({
      room: { search: 'Onyx', option: 'Onyx · Rules Hub' },
      member: { search: 'Rules', option: 'Rita Rules' },
      day: daysFromToday(22),
      from: '11:00',
      to: '10:00',
      attendees: 9,
    });
    await form.notes.click();

    await expect(form.alert('End must be after start')).toBeVisible();
    await expect(form.alert('This room seats up to 4')).toBeVisible();
    await expect(form.save).toBeDisabled();

    await form.fill({ to: '12:00', attendees: 4 });
    await expect(form.alerts).toHaveCount(0);
    await expect(form.save).toBeEnabled();
  });

  test('cancels bookings in bulk, after asking', async ({ signedInPage: page, api }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    const room = await createRoom(api, location.id, { name: 'Onyx' });
    const ann = await createMember(api, {
      firstName: 'Ann',
      lastName: 'Alpha',
      email: 'ann@example.com',
    });
    const bob = await createMember(api, {
      firstName: 'Bob',
      lastName: 'Beta',
      email: 'bob@example.com',
    });
    const cy = await createMember(api, {
      firstName: 'Cy',
      lastName: 'Gamma',
      email: 'cy@example.com',
    });
    await createBooking(api, { roomId: room.id, memberId: ann.id, day: daysFromToday(40) });
    await createBooking(api, { roomId: room.id, memberId: bob.id, day: daysFromToday(41) });
    await createBooking(api, { roomId: room.id, memberId: cy.id, day: daysFromToday(42) });
    const bookings = new BookingsPage(page);
    const notifications = new Notifications(page);

    await bookings.goto(`?status=pending&roomId=${room.id}`);
    await bookings.table.expectRows(3);
    await expect(bookings.table.range).toHaveText('1 – 3 of 3');
    await expect(bookings.selectedCount).toHaveCount(0);
    await expect(bookings.bulkCancel).toHaveCount(0);

    await bookings.select('Ann Alpha', 'Bob Beta');
    await expect(bookings.selectedCount).toHaveText('2 selected');

    // Changing one's mind leaves everything as it was.
    const question = await bookings.askToCancelSelected(2);
    await question.decline('Keep');
    await bookings.table.expectRows(3);
    await expect(bookings.selectedCount).toHaveText('2 selected');

    await bookings.cancelSelected(2);

    await notifications.expectMessage('2 bookings cancelled');
    await bookings.table.expectRows(1);
    await expect(bookings.table.row('Cy Gamma')).toBeVisible();
    await expect(bookings.table.range).toHaveText('1 – 1 of 1');
    await expect(bookings.selectedCount).toHaveCount(0);
    await expect(bookings.toolbar.search).toBeFocused();
  });

  test('says which bookings a bulk action could not move, and why', async ({
    signedInPage: page,
    api,
  }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    const room = await createRoom(api, location.id, { name: 'Onyx' });
    const ann = await createMember(api, {
      firstName: 'Ann',
      lastName: 'Alpha',
      email: 'ann@example.com',
    });
    const bob = await createMember(api, {
      firstName: 'Bob',
      lastName: 'Beta',
      email: 'bob@example.com',
    });
    await createBooking(api, { roomId: room.id, memberId: ann.id, day: daysFromToday(40) });
    const cancelled = await createBooking(api, {
      roomId: room.id,
      memberId: bob.id,
      day: daysFromToday(41),
      status: 'cancelled',
    });
    const bookings = new BookingsPage(page);
    const notifications = new Notifications(page);

    await bookings.goto(`?roomId=${room.id}`);
    await bookings.table.expectRows(2);
    await bookings.select('Ann Alpha', 'Bob Beta');
    await bookings.bulkConfirm.click();

    await notifications.expectMessage('1 booking confirmed');
    const result = new BulkResultDialog(page, 'confirmed');
    await result.expectOpen();
    await expect(result.dialog.getByRole('listitem')).toHaveCount(1);
    await expect(result.dialog.getByRole('link')).toHaveAttribute(
      'href',
      `/bookings/${cancelled.id}`,
    );
    await expect(result.dialog).toContainText('Cannot confirm a booking that is cancelled');

    await result.close.click();
    await expect(result.dialog).toBeHidden();
    await expect(bookings.table.row('Ann Alpha')).toContainText('Confirmed');
    await expect(bookings.table.row('Bob Beta')).toContainText('Cancelled');
    // Closing the result returns to where the selection was made.
    await expect(bookings.toolbar.search).toBeFocused();
  });
});
