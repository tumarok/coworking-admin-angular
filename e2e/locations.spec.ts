import { expect, test } from './fixtures';
import { LocationDetailsPage } from './pages/location-details-page';
import { LocationsPage } from './pages/locations-page';
import { Notifications } from './pages/notifications';
import { RoomsPage } from './pages/rooms-page';
import { createLocation, createRoom } from './support/data';

test.describe('locations', () => {
  test('lists the locations, searches them and filters by status', async ({
    signedInPage: page,
    api,
  }) => {
    // What the lists must show is read from the API, not copied from the seed.
    const { items, total } = await api.get<{
      items: { name: string; city: string; address: string; status: string }[];
      total: number;
    }>('/locations');
    const inactive = items.filter((location) => location.status === 'inactive');
    const [closed] = inactive;
    if (!closed) throw new Error('The seed has no inactive location');
    const needle = closed.city.toLowerCase();
    const found = items.filter((location) =>
      [location.name, location.city, location.address].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );

    const locations = new LocationsPage(page);
    await locations.goto();
    await locations.table.expectLoaded();
    await expect(locations.table.range).toHaveText(`1 – ${total} of ${total}`);

    await locations.toolbar.search.fill(needle);
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === needle);
    await locations.table.expectRows(found.length);
    await expect(locations.table.row(closed.name)).toContainText('Inactive');

    await locations.toolbar.clearFilters.click();
    await locations.toolbar.choose('Status', 'Inactive');
    await expect(page).toHaveURL(/status=inactive/);
    await locations.table.expectRows(inactive.length);
    await expect(locations.table.link(closed.name)).toBeVisible();
  });

  test('edits a location from its page', async ({ signedInPage: page, api }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    const details = new LocationDetailsPage(page, 'Rules Hub');
    const notifications = new Notifications(page);
    await details.goto(location.id);
    await expect(details.facts.value('Opening hours')).toHaveText('08:00–20:00');

    const form = await details.openEditForm();
    // Nothing to save until something changes.
    await expect(form.save).toBeDisabled();
    await form.fill({
      name: 'Rules Plaza',
      city: 'Lviv',
      timezone: 'Europe/Warsaw',
      status: 'Inactive',
      closesAt: '18:30',
    });
    await form.submitAndClose();

    await notifications.expectMessage('Location updated: Rules Plaza');
    await expect(page.getByRole('heading', { name: 'Rules Plaza', level: 1 })).toBeVisible();
    await expect(details.facts.value('City')).toHaveText('Lviv');
    await expect(details.facts.value('Time zone')).toHaveText('Europe/Warsaw');
    await expect(details.facts.value('Opening hours')).toHaveText('08:00–18:30');
    await expect(details.facts.value('Status')).toHaveText('Inactive');
  });

  test('checks the form before sending it', async ({ signedInPage: page }) => {
    const locations = new LocationsPage(page);
    await locations.goto();

    const form = await locations.openNewLocationForm();
    await expect(form.save).toBeDisabled();
    await form.fill({ name: 'A', city: 'Kyiv', address: '5 Test Embankment', opensAt: '09:00' });
    await form.fill({ closesAt: '08:00' });
    await form.address.click();

    await expect(form.alert('At least 2 characters')).toBeVisible();
    await expect(form.alert('Closing time must be after opening time')).toBeVisible();
    await expect(form.save).toBeDisabled();

    await form.fill({ name: 'Ab', closesAt: '17:00' });
    await expect(form.alerts).toHaveCount(0);
    await expect(form.save).toBeEnabled();
    await form.cancel.click();
    await form.expectClosed();
  });

  test('deletes a location after asking', async ({ signedInPage: page, api }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    const details = new LocationDetailsPage(page, 'Rules Hub');
    await details.goto(location.id);

    const keep = await details.askToDelete();
    await keep.decline();
    await expect(details.heading).toBeVisible();

    const question = await details.askToDelete();
    await question.confirm('Delete');

    await new Notifications(page).expectMessage('Location deleted: Rules Hub');
    await expect(page).toHaveURL(/\/locations$/);
    const locations = new LocationsPage(page);
    await expect(locations.heading).toBeVisible();
    await locations.table.expectLoaded();
    await expect(locations.table.row('Rules Hub')).toHaveCount(0);
  });

  test('refuses to delete a location that has rooms, and stays on its page', async ({
    signedInPage: page,
    api,
  }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    await createRoom(api, location.id, { name: 'Onyx' });
    const details = new LocationDetailsPage(page, 'Rules Hub');
    await details.goto(location.id);
    await expect(details.facts.value('Rooms')).toContainText('1');

    const question = await details.askToDelete();
    await question.confirm('Delete');

    await new Notifications(page).expectMessage('Remove or move the rooms of this location first');
    await expect(page).toHaveURL(new RegExp(`/locations/${location.id}$`));
    await expect(details.heading).toBeVisible();
    await expect(details.delete).toBeEnabled();
  });

  test('links to the rooms of the location', async ({ signedInPage: page, api }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    await createRoom(api, location.id, { name: 'Onyx' });
    await createRoom(api, location.id, { name: 'Opal' });
    const details = new LocationDetailsPage(page, 'Rules Hub');
    const rooms = new RoomsPage(page);
    await details.goto(location.id);

    await details.viewRooms.click();

    await expect(page).toHaveURL(new RegExp(`/rooms\\?locationId=${location.id}$`));
    await expect(rooms.toolbar.filter('Location')).toHaveText('Rules Hub');
    await rooms.table.expectRows(2);
    await expect(rooms.table.range).toHaveText('1 – 2 of 2');
  });
});
