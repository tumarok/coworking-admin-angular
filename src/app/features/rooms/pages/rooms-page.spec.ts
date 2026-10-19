import { Location as BrowserLocation } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import type { Room } from '@shared/api/contract';
import { formatMoney, humanize } from '@shared/util/format';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { ROOM_ROUTES } from '../rooms.routes';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

/** A room as the mock stores it: the API adds the location's name. */
type StoredRoom = Omit<Room, 'locationName'>;

describe('RoomsPage', () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: URL[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/rooms')) requests.push(url);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  /** The rooms the list shows for a filter, in the API's order: by location name, then room name. */
  const roomsWhere = (keep: (room: StoredRoom, location: string) => boolean = () => true) =>
    api.db.rooms
      .map((room) => ({
        room,
        location: api.db.locations.find((l) => l.id === room.locationId)?.name ?? '—',
      }))
      .filter(({ room, location }) => keep(room, location))
      .sort(
        (a, b) => a.location.localeCompare(b.location) || a.room.name.localeCompare(b.room.name),
      )
      .map(({ room }) => room);
  const namesOf = (rooms: StoredRoom[]) => rooms.map((r) => r.name);
  const locationName = (id: string) => api.db.locations.find((l) => l.id === id)?.name ?? '';

  async function open(url = '/rooms') {
    const view = await render(Outlet, {
      providers: provideTestSession([{ path: 'rooms', children: ROOM_ROUTES }]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await view.fixture.whenStable();
    return { ...view, router, location: TestBed.inject(BrowserLocation) };
  }

  const rowNames = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0].textContent.trim());
  const queryOf = (url: URL) => Object.fromEntries(url.searchParams);
  const loaded = (expected: string[]) =>
    vi.waitFor(() => {
      expect(rowNames()).toEqual(expected);
    });
  const pick = async (filter: string, option: string) => {
    await userEvent.click(screen.getByRole('combobox', { name: filter }));
    await userEvent.click(await screen.findByRole('option', { name: option }));
  };
  const first20 = () => namesOf(roomsWhere()).slice(0, 20);

  describe('the page', () => {
    it('has a title and a subtitle', async () => {
      await open();

      expect(screen.getByRole('heading', { level: 1, name: 'Rooms' })).toBeInTheDocument();
      expect(
        screen.getByText('Meeting rooms, offices, desks and event spaces'),
      ).toBeInTheDocument();
      await loaded(first20());
    });

    it('lists the rooms with their details, a link to the room and one to its location', async () => {
      await open();
      await loaded(first20());

      const room = roomsWhere()[0];
      const row = screen.getAllByRole('row')[1];
      expect(within(row).getByRole('link', { name: room.name })).toHaveAttribute(
        'href',
        `/rooms/${room.id}`,
      );
      expect(
        within(row).getByRole('link', { name: locationName(room.locationId) }),
      ).toHaveAttribute('href', `/locations/${room.locationId}`);
      expect(within(row).getByText(humanize(room.type))).toBeInTheDocument();
      expect(within(row).getByText(String(room.capacity))).toBeInTheDocument();
      expect(within(row).getByText(formatMoney(room.hourlyRate))).toBeInTheDocument();
      expect(within(row).getByText(humanize(room.status))).toBeInTheDocument();
      expect(
        screen.getAllByRole('columnheader').map((header) => header.textContent.trim()),
      ).toEqual(['Name', 'Location', 'Type', 'Seats', 'Rate / hour', 'Status']);
    });

    it('asks the API for the first page once', async () => {
      await open();
      await loaded(first20());

      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1' }]);
    });

    it('opens the details of a room from its name', async () => {
      const { router } = await open();
      await loaded(first20());
      const room = roomsWhere()[0];

      await userEvent.click(screen.getAllByRole('link', { name: room.name })[0]);

      await vi.waitFor(() => {
        expect(router.url).toBe(`/rooms/${room.id}`);
      });
      expect(await screen.findByRole('heading', { level: 1, name: room.name })).toBeInTheDocument();
    });

    it('says, instead of linking, when the location of a room no longer exists', async () => {
      const room = roomsWhere((r) => r.locationId === 'loc_4')[0];
      api.db.locations = api.db.locations.filter((l) => l.id !== 'loc_4');
      await open('/rooms?locationId=loc_4');
      await loaded(namesOf(roomsWhere((r) => r.locationId === 'loc_4')));

      const row = screen.getByRole('row', { name: new RegExp(room.name) });
      expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('Deleted location');
      expect(within(row).getAllByRole('link')).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('puts the search in the URL and loads the list once', async () => {
      const { location } = await open();
      await loaded(first20());
      requests.length = 0;

      await userEvent.type(screen.getByRole('searchbox', { name: 'Search rooms' }), 'canal');

      await loaded(namesOf(roomsWhere((_r, l) => l.toLowerCase().includes('canal'))));
      expect(location.path()).toBe('/rooms?q=canal');
      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1', q: 'canal' }]);
    });

    it('starts from the search the URL carries', async () => {
      await open('/rooms?q=harbour');

      expect(screen.getByRole('searchbox', { name: 'Search rooms' })).toHaveValue('harbour');
      await loaded(namesOf(roomsWhere((_r, l) => l.toLowerCase().includes('harbour'))));
    });
  });

  describe('the location filter', () => {
    it('offers the locations by name, and narrows the list to one with a single request', async () => {
      const { location } = await open();
      await loaded(first20());
      requests.length = 0;

      await userEvent.click(screen.getByRole('combobox', { name: 'Location' }));
      const options = await screen.findAllByRole('option');
      expect(options.map((o) => o.textContent.trim())).toEqual([
        'Any location',
        ...api.db.locations.map((l) => l.name).sort((a, b) => a.localeCompare(b)),
      ]);
      await userEvent.click(screen.getByRole('option', { name: 'Canal Yard' }));

      await loaded(namesOf(roomsWhere((r) => r.locationId === 'loc_4')));
      expect(location.path()).toBe('/rooms?locationId=loc_4');
      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1', locationId: 'loc_4' }]);
    });

    it('is preselected by the link a location’s page offers: ?locationId=<id>', async () => {
      await open('/rooms?locationId=loc_4');

      await loaded(namesOf(roomsWhere((r) => r.locationId === 'loc_4')));
      await vi.waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Location' })).toHaveTextContent('Canal Yard');
      });
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    });

    it('shows a location it does not know as Unknown location, so the filter can be taken off', async () => {
      const { location } = await open('/rooms?locationId=loc_nope');

      expect(await screen.findByText('No rooms match the current filters.')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Location' })).toHaveTextContent(
          'Unknown location',
        );
      });

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

      await loaded(first20());
      expect(location.path()).toBe('/rooms');
      expect(screen.getByRole('combobox', { name: 'Location' })).toHaveTextContent('Any location');
    });

    it('does not offer Unknown location for a location the API lists', async () => {
      await open('/rooms?locationId=loc_4');
      await loaded(namesOf(roomsWhere((r) => r.locationId === 'loc_4')));

      await userEvent.click(screen.getByRole('combobox', { name: 'Location' }));

      expect(await screen.findByRole('option', { name: 'Canal Yard' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Unknown location' })).not.toBeInTheDocument();
    });

    it('takes the filter off again with Any location', async () => {
      const { location } = await open('/rooms?locationId=loc_4');
      await loaded(namesOf(roomsWhere((r) => r.locationId === 'loc_4')));

      await pick('Location', 'Any location');

      await loaded(first20());
      expect(location.path()).toBe('/rooms');
    });
  });

  describe('the type and status filters', () => {
    it('narrows the list to one type from page 1 with one request', async () => {
      const { location } = await open('/rooms?limit=2&page=2');
      await loaded(namesOf(roomsWhere()).slice(2, 4));
      requests.length = 0;

      await pick('Type', 'Event space');

      await loaded(namesOf(roomsWhere((r) => r.type === 'event_space')).slice(0, 2));
      expect(location.path()).toBe('/rooms?limit=2&type=event_space');
      expect(requests.map(queryOf)).toEqual([{ limit: '2', page: '1', type: 'event_space' }]);
    });

    it('narrows the list to one status', async () => {
      const { location } = await open();
      await loaded(first20());

      await pick('Status', 'Retired');

      await loaded(namesOf(roomsWhere((r) => r.status === 'retired')));
      expect(location.path()).toBe('/rooms?status=retired');
    });

    it('shows Any type and Any status when nothing is set', async () => {
      await open();
      await loaded(first20());

      expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Any type');
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Any status');
    });

    it('ignores a type the API does not know', async () => {
      await open('/rooms?type=garage');

      await loaded(first20());
      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1' }]);
    });
  });

  describe('clearing the filters', () => {
    it('is offered only while something narrows the list', async () => {
      await open();
      await loaded(first20());
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

      await userEvent.type(screen.getByRole('searchbox', { name: 'Search rooms' }), 'canal{Enter}');

      expect(await screen.findByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    });

    it('empties the search and every filter together, with one request', async () => {
      const { location } = await open(
        '/rooms?q=canal&locationId=loc_4&type=meeting_room&status=available',
      );
      await loaded(
        namesOf(
          roomsWhere(
            (r) =>
              r.locationId === 'loc_4' && r.type === 'meeting_room' && r.status === 'available',
          ),
        ),
      );
      requests.length = 0;

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

      await loaded(first20());
      expect(location.path()).toBe('/rooms');
      expect(requests).toHaveLength(1);
      expect(screen.getByRole('searchbox', { name: 'Search rooms' })).toHaveValue('');
      expect(screen.getByRole('combobox', { name: 'Location' })).toHaveTextContent('Any location');
      expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Any type');
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Any status');
    });
  });

  describe('pagination', () => {
    it('moves to the next page: the URL changes and exactly one request goes out', async () => {
      const { location } = await open('/rooms?limit=10');
      await loaded(namesOf(roomsWhere()).slice(0, 10));
      requests.length = 0;

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

      await loaded(namesOf(roomsWhere()).slice(10, 20));
      expect(location.path()).toBe('/rooms?limit=10&page=2');
      expect(requests.map(queryOf)).toEqual([{ limit: '10', page: '2' }]);
      expect(screen.getByText(`11 – 20 of ${api.db.rooms.length}`)).toBeInTheDocument();
    });

    it('restores the page from a shared link', async () => {
      await open('/rooms?limit=10&page=3');

      await loaded(namesOf(roomsWhere()).slice(20, 30));
    });
  });

  describe('when there is nothing to show', () => {
    it('says that no rooms match the filters', async () => {
      await open('/rooms?q=zzzz');

      expect(await screen.findByText('No rooms match the current filters.')).toBeInTheDocument();
    });

    it('says there are no rooms yet when the network has none', async () => {
      api.db.rooms = [];

      await open();

      expect(await screen.findByText('No rooms yet.')).toBeInTheDocument();
    });
  });

  describe('when the load fails', () => {
    it('shows the reason in the table and loads the list again on request', async () => {
      server.use(
        http.get(apiUrl('/rooms'), () => HttpResponse.json({ message: 'Boom' }, { status: 500 }), {
          once: true,
        }),
      );
      await open();

      expect(await screen.findByRole('alert')).toHaveTextContent('Boom');

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      await loaded(first20());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('creating a room', () => {
    const openForm = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'New room' }));
      return screen.findByRole('dialog', { name: 'New room' });
    };

    it('opens the form, saves, and goes to the new room', async () => {
      const { router } = await open();
      await loaded(first20());

      const dialog = await openForm();
      await userEvent.click(within(dialog).getByRole('combobox', { name: /^Location/ }));
      await userEvent.click(await screen.findByRole('option', { name: 'Canal Yard' }));
      await userEvent.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Harbour Room');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      await vi.waitFor(() => {
        expect(router.url).toMatch(/^\/rooms\/room_\w+$/);
      });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Harbour Room' }),
      ).toBeInTheDocument();
      expect(api.db.rooms.map((r) => r.name)).toContain('Harbour Room');
    });

    it('gives focus back to the New room button when the form is cancelled', async () => {
      await open();
      await loaded(first20());

      const dialog = await openForm();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'New room' })).toHaveFocus();
      });
    });

    it('stays on the list when the form is cancelled', async () => {
      const { router } = await open();
      await loaded(first20());

      const dialog = await openForm();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(router.url).toBe('/rooms');
    });
  });
});
