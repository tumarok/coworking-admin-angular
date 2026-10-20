import { daysFromToday, expect, test } from './fixtures';
import { AppShell } from './pages/app-shell';
import { BookingDetailsPage } from './pages/booking-details-page';
import { BookingsPage } from './pages/bookings-page';
import { LocationsPage } from './pages/locations-page';
import { MembersPage } from './pages/members-page';
import { Notifications } from './pages/notifications';
import { RoomsPage } from './pages/rooms-page';

test('creates a location, a room and a member, then books the room and confirms the booking', async ({
  signedInPage: page,
}) => {
  const shell = new AppShell(page);
  const notifications = new Notifications(page);

  // A location: the form starts as an active Kyiv location open 08:00 to 20:00.
  const locations = new LocationsPage(page);
  await locations.goto();
  const locationForm = await locations.openNewLocationForm();
  await locationForm.fill({ name: 'Test Harbour', city: 'Kyiv', address: '5 Test Embankment' });
  await locationForm.submitAndClose();
  await notifications.expectMessage('Location created: Test Harbour');
  await expect(page.getByRole('heading', { name: 'Test Harbour', level: 1 })).toBeVisible();

  // A room in it.
  await shell.open('Rooms');
  const rooms = new RoomsPage(page);
  await expect(rooms.heading).toBeVisible();
  const roomForm = await rooms.openNewRoomForm();
  await roomForm.fill({ location: 'Test Harbour', name: 'Quartz', capacity: 6, hourlyRate: 25 });
  await roomForm.submitAndClose();
  await notifications.expectMessage('Room created: Quartz');
  await expect(page.getByRole('heading', { name: 'Quartz', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Test Harbour' })).toBeVisible();

  // A member.
  await shell.open('Members');
  const members = new MembersPage(page);
  await expect(members.heading).toBeVisible();
  const memberForm = await members.openNewMemberForm();
  await memberForm.fill({
    firstName: 'Dana',
    lastName: 'Testova',
    email: 'dana.testova@example.com',
    phone: '+380 44 000 00 00',
  });
  await memberForm.submitAndClose();
  await notifications.expectMessage('Member added: Dana Testova');
  await expect(page.getByRole('heading', { name: 'Dana Testova', level: 1 })).toBeVisible();

  // The booking: an hour and a half on the room's own clock.
  await shell.open('Bookings');
  const bookings = new BookingsPage(page);
  await expect(bookings.heading).toBeVisible();
  const bookingForm = await bookings.openNewBookingForm();
  await bookingForm.fill({
    room: { search: 'Quartz', option: 'Quartz · Test Harbour' },
    member: { search: 'Testova', option: 'Dana Testova' },
    day: daysFromToday(30),
    from: '10:00',
    to: '11:30',
  });
  await bookingForm.submitAndClose();
  await notifications.expectMessage(/Booking created: Quartz, .*10:00–11:30/);

  // It opens the new booking, which waits to be confirmed.
  const booking = new BookingDetailsPage(page);
  await expect(page).toHaveURL(/\/bookings\/bk_\w+$/);
  await expect(booking.heading).toContainText('Quartz');
  await expect(booking.status('Pending')).toBeVisible();
  await expect(booking.facts.value('Location')).toHaveText('Test Harbour');
  await expect(booking.facts.value('Member')).toHaveText('Dana Testova');
  await expect(booking.facts.value('Price')).toHaveText('€37.50');

  await booking.move('Confirm').click();
  await expect(booking.status('Confirmed')).toBeVisible();
  await notifications.expectMessage('Booking confirmed');
});
