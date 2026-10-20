import { daysFromToday, expect, test } from './fixtures';
import { Notifications } from './pages/notifications';
import { RoomDetailsPage } from './pages/room-details-page';
import { RoomsPage } from './pages/rooms-page';
import { createBooking, createLocation, createMember, createRoom } from './support/data';

test.describe('rooms', () => {
  test('filters the list by type and status, and clears the filters', async ({
    signedInPage: page,
    api,
  }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    await createRoom(api, location.id, { name: 'Onyx', type: 'meeting_room' });
    await createRoom(api, location.id, { name: 'Opal', type: 'hot_desk', status: 'maintenance' });
    const rooms = new RoomsPage(page);
    await rooms.goto('?q=Rules Hub');
    await rooms.table.expectRows(2);

    await rooms.toolbar.choose('Type', 'Hot desk');
    await expect(page).toHaveURL(/type=hot_desk/);
    await rooms.table.expectRows(1);
    await expect(rooms.table.row('Opal')).toContainText('Maintenance');

    await rooms.toolbar.choose('Status', 'Available');
    await expect(page).toHaveURL(/status=available/);
    await rooms.table.expectEmpty();

    await rooms.toolbar.clearFilters.click();
    await expect(page).toHaveURL(/\/rooms$/);
    await expect(rooms.toolbar.filter('Type')).toHaveText('Any type');
    await expect(rooms.table.rows.first()).toBeVisible();
  });

  test('edits a room from its page', async ({ signedInPage: page, api }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    const room = await createRoom(api, location.id, {
      name: 'Onyx',
      hourlyRate: 2500,
      capacity: 6,
    });
    const details = new RoomDetailsPage(page, 'Onyx');
    await details.goto(room.id);
    await expect(details.facts.value('Rate')).toHaveText('€25.00 / hour');
    await expect(details.facts.value('Capacity')).toHaveText('6 seats');

    const form = await details.openEditForm();
    await expect(form.save).toBeDisabled();
    await form.fill({
      name: 'Onyx Prime',
      type: 'Private office',
      capacity: 1,
      hourlyRate: 30.5,
      status: 'Maintenance',
    });
    await form.submitAndClose();

    await new Notifications(page).expectMessage('Room updated: Onyx Prime');
    await expect(page.getByRole('heading', { name: 'Onyx Prime', level: 1 })).toBeVisible();
    await expect(details.facts.value('Rate')).toHaveText('€30.50 / hour');
    await expect(details.facts.value('Capacity')).toHaveText('1 seat');
    await expect(details.facts.value('Type')).toHaveText('Private office');
    await expect(details.facts.value('Status')).toHaveText('Maintenance');
    await expect(details.facts.value('Location')).toHaveText('Rules Hub');
  });

  test('checks the form before sending it', async ({ signedInPage: page, api }) => {
    await createLocation(api, { name: 'Rules Hub' });
    const rooms = new RoomsPage(page);
    await rooms.goto();

    const form = await rooms.openNewRoomForm();
    await form.fill({ location: 'Rules Hub', name: 'O' });
    await form.capacity.clear();
    await form.hourlyRate.fill('12.345');
    await form.name.click();

    await expect(form.alert('At least 2 characters')).toBeVisible();
    await expect(form.alert('Enter the number of seats')).toBeVisible();
    await expect(form.alert('Use at most 2 decimals')).toBeVisible();
    await expect(form.save).toBeDisabled();

    await form.fill({ name: 'Onyx', capacity: 6, hourlyRate: 12.34 });
    await expect(form.alerts).toHaveCount(0);
    await expect(form.save).toBeEnabled();
  });

  test('deletes a room after asking', async ({ signedInPage: page, api }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    const room = await createRoom(api, location.id, { name: 'Onyx' });
    const details = new RoomDetailsPage(page, 'Onyx');
    await details.goto(room.id);

    const question = await details.askToDelete();
    await question.confirm('Delete');

    await new Notifications(page).expectMessage('Room deleted: Onyx');
    await expect(page).toHaveURL(/\/rooms$/);
    const rooms = new RoomsPage(page);
    await expect(rooms.heading).toBeVisible();
    await rooms.toolbar.search.fill('Onyx');
    await rooms.table.expectEmpty();
  });

  test('refuses to delete a room that has upcoming bookings', async ({
    signedInPage: page,
    api,
  }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    const room = await createRoom(api, location.id, { name: 'Onyx' });
    const member = await createMember(api);
    await createBooking(api, { roomId: room.id, memberId: member.id, day: daysFromToday(10) });
    const details = new RoomDetailsPage(page, 'Onyx');
    await details.goto(room.id);

    const question = await details.askToDelete();
    await question.confirm('Delete');

    await new Notifications(page).expectMessage(
      'This room has upcoming bookings; cancel them first',
    );
    await expect(page).toHaveURL(new RegExp(`/rooms/${room.id}$`));
    await expect(details.heading).toBeVisible();
  });
});
