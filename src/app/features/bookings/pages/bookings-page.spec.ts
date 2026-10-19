import { Location as BrowserLocation } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { formatMoney, formatTimeRange, humanize } from '@shared/util/format';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { BOOKING_ROUTES } from '../bookings.routes';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

describe('BookingsPage', () => {
  // The first "New booking" fetches the form's chunk (pickers, autocomplete, Zod). Doing it here
  // keeps that one-off cost out of the test that opens it, which would otherwise race the 5 s wait.
  beforeAll(async () => {
    await import('../dialogs/booking-form-dialog');
  });

  let api: ReturnType<typeof installMockApi>;
  let requests: URL[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/bookings')) requests.push(url);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  type Stored = (typeof api.db.bookings)[number];

  /** The bookings the list shows for a filter, in the API's order: the latest start first. */
  const bookingsWhere = (keep: (booking: Stored) => boolean = () => true) =>
    api.db.bookings.filter(keep).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const roomOf = (b: Stored) => api.db.rooms.find((r) => r.id === b.roomId);
  const locationOf = (b: Stored) => api.db.locations.find((l) => l.id === roomOf(b)?.locationId);
  const memberOf = (b: Stored) => api.db.members.find((m) => m.id === b.memberId);
  const fullName = (b: Stored) => `${memberOf(b)?.firstName} ${memberOf(b)?.lastName}`;

  async function open(url = '/bookings', { settle = true } = {}) {
    const view = await render(Outlet, {
      providers: provideTestSession([{ path: 'bookings', children: BOOKING_ROUTES }]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    // Stable means every request has been answered, which a test of a loading state must not wait for.
    if (settle) await view.fixture.whenStable();
    return { ...view, router, location: TestBed.inject(BrowserLocation) };
  }

  /** The id of each booking row, from the link of its first cell. */
  const rowIds = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .flatMap((row) => {
        const link = within(row).queryAllByRole('link').at(0);
        return link?.getAttribute('href')?.startsWith('/bookings/')
          ? [link.getAttribute('href')?.replace('/bookings/', '') ?? '']
          : [];
      });
  const loaded = (expected: Stored[]) =>
    vi.waitFor(() => {
      expect(rowIds()).toEqual(expected.map((b) => b.id));
    });
  const queryOf = (url: URL) => Object.fromEntries(url.searchParams);
  const pick = async (filter: string, option: string) => {
    await userEvent.click(screen.getByRole('combobox', { name: filter }));
    await userEvent.click(await screen.findByRole('option', { name: option }));
  };
  const type = async (name: string, text: string) => {
    await userEvent.type(screen.getByRole('textbox', { name }), text);
  };
  const search = async (text: string) => {
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search member or room' }), text);
  };
  const first20 = () => bookingsWhere().slice(0, 20);

  describe('the page', () => {
    it('has a title and a subtitle', async () => {
      await open();

      expect(screen.getByRole('heading', { level: 1, name: 'Bookings' })).toBeInTheDocument();
      expect(screen.getByText('Who uses which room, and when')).toBeInTheDocument();
      await loaded(first20());
    });

    it('lists the bookings with their details, in the columns of a booking', async () => {
      await open();
      await loaded(first20());

      expect(
        screen.getAllByRole('columnheader').map((header) => header.textContent.trim()),
      ).toEqual(['When', 'Room', 'Member', 'People', 'Price', 'Status']);
      const booking = first20()[0];
      const row = screen.getAllByRole('row')[1];
      const when = formatTimeRange(booking.startsAt, booking.endsAt, locationOf(booking)?.timezone);
      expect(within(row).getByRole('link', { name: when })).toHaveAttribute(
        'href',
        `/bookings/${booking.id}`,
      );
      expect(within(row).getByRole('link', { name: roomOf(booking)?.name })).toHaveAttribute(
        'href',
        `/rooms/${booking.roomId}`,
      );
      expect(within(row).getByText(locationOf(booking)?.name ?? '')).toBeInTheDocument();
      expect(within(row).getByRole('link', { name: fullName(booking) })).toHaveAttribute(
        'href',
        `/members/${booking.memberId}`,
      );
      expect(within(row).getByText(String(booking.attendees))).toBeInTheDocument();
      expect(within(row).getByText(formatMoney(booking.totalPrice))).toBeInTheDocument();
      expect(within(row).getByText(humanize(booking.status))).toBeInTheDocument();
    });

    it('asks the API for the first page once', async () => {
      await open();
      await loaded(first20());

      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1' }]);
    });

    it('opens the details of a booking from its time', async () => {
      const { router } = await open();
      await loaded(first20());
      const booking = first20()[0];

      await userEvent.click(screen.getAllByRole('link', { name: /Nov 2026|Oct 2026|Dec 2026/ })[0]);

      await vi.waitFor(() => {
        expect(router.url).toBe(`/bookings/${booking.id}`);
      });
    });
  });

  describe('time zones', () => {
    /**
     * A booking in a room of the Berlin location, around the night the clock goes back there, and
     * the member it is alone with on that day, which the address narrows the list to.
     */
    function berlinBooking() {
      const room = api.db.rooms.find((r) => r.locationId === 'loc_4');
      const member = api.db.members[0];
      const booking = api.db.bookings[0];
      if (!room) throw new Error('seed has no room in Berlin');
      booking.roomId = room.id;
      booking.memberId = member.id;
      booking.startsAt = '2026-10-25T02:00:00.000Z';
      booking.endsAt = '2026-10-25T03:30:00.000Z';
      return { booking, url: `/bookings?memberId=${member.id}&from=2026-10-25&to=2026-10-25` };
    }

    it('shows each booking on the clock of its own location, not the browser’s', async () => {
      const { booking, url } = berlinBooking();

      await open(url);

      // 02:00 UTC is 03:00 in Berlin, once the clock has gone back (UTC+1).
      const link = await screen.findByRole('link', { name: '25 Oct 2026, 03:00–04:30' });
      expect(link).toHaveAttribute('href', `/bookings/${booking.id}`);
    });

    it('reads a booking of the same instant in a location with another zone differently', async () => {
      const { booking, url } = berlinBooking();
      const kyiv = api.db.rooms.find((r) => r.locationId === 'loc_1');
      if (!kyiv) throw new Error('seed has no room in Kyiv');
      const other = api.db.bookings[1];
      Object.assign(other, {
        roomId: kyiv.id,
        memberId: booking.memberId,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      });

      await open(url);

      expect(await screen.findByRole('link', { name: '25 Oct 2026, 03:00–04:30' })).toHaveAttribute(
        'href',
        `/bookings/${booking.id}`,
      );
      // Kyiv is one hour further ahead.
      expect(screen.getByRole('link', { name: '25 Oct 2026, 04:00–05:30' })).toHaveAttribute(
        'href',
        `/bookings/${other.id}`,
      );
    });

    it('draws no time until the zones are known, so no row is drawn in one clock and then another', async () => {
      let release: () => void = () => undefined;
      server.use(
        http.get(apiUrl('/locations'), async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 });
        }),
      );
      await render(Outlet, {
        providers: provideTestSession([{ path: 'bookings', children: BOOKING_ROUTES }]),
      });
      await TestBed.inject(Router).navigateByUrl('/bookings');

      expect(await screen.findByText('Loading Bookings…')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      expect(screen.queryAllByRole('link', { name: /20\d\d, \d\d:\d\d/ })).toHaveLength(0);

      release();
      await loaded(first20());
    });

    it('still shows the bookings, in UTC and saying so, when the locations cannot be loaded', async () => {
      server.use(
        http.get(apiUrl('/locations'), () =>
          HttpResponse.json({ message: 'Boom' }, { status: 500 }),
        ),
      );
      await open();

      await loaded(first20());
      const booking = first20()[0];
      const utc = formatTimeRange(booking.startsAt, booking.endsAt, 'UTC');
      expect(screen.getByRole('link', { name: `${utc} UTC` })).toBeInTheDocument();
    });
  });

  describe('a booking whose room or member was deleted', () => {
    it('says Deleted room, instead of a link, and reads the time in UTC', async () => {
      const booking = first20()[0];
      api.db.rooms = api.db.rooms.filter((r) => r.id !== booking.roomId);
      await open();
      await loaded(first20());

      const row = screen.getAllByRole('row')[1];
      expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('Deleted room');
      expect(within(row).queryByRole('link', { name: /^Deleted room/ })).not.toBeInTheDocument();
      expect(within(row).getByRole('link', { name: /UTC$/ })).toBeInTheDocument();
    });

    it('says Deleted member, instead of a link', async () => {
      const booking = first20()[0];
      api.db.members = api.db.members.filter((m) => m.id !== booking.memberId);
      await open();
      await loaded(first20());

      const row = screen.getAllByRole('row')[1];
      expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('Deleted member');
      expect(within(row).queryByRole('link', { name: 'Deleted member' })).not.toBeInTheDocument();
      expect(within(row).getByRole('link', { name: roomOf(booking)?.name })).toBeInTheDocument();
    });

    it('keeps the room’s link, and drops the location’s name, when only the location is gone', async () => {
      const booking = first20()[0];
      const location = locationOf(booking);
      api.db.locations = api.db.locations.filter((l) => l.id !== location?.id);
      await open();
      await loaded(first20());

      const row = screen.getAllByRole('row')[1];
      expect(within(row).getByRole('link', { name: roomOf(booking)?.name })).toBeInTheDocument();
      expect(within(row).queryByText(location?.name ?? '')).not.toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('puts the search in the URL and loads the list once', async () => {
      const { location } = await open();
      await loaded(first20());
      requests.length = 0;
      const name = memberOf(first20()[0])?.lastName ?? '';

      await search(name);

      await loaded(
        bookingsWhere((b) => fullName(b).toLowerCase().includes(name.toLowerCase())).slice(0, 20),
      );
      expect(location.path()).toBe(`/bookings?q=${name}`);
      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1', q: name }]);
    });

    it('starts from the search the URL carries', async () => {
      const room = roomOf(first20()[0])?.name ?? '';
      await open(`/bookings?q=${room}`);

      expect(screen.getByRole('searchbox', { name: 'Search member or room' })).toHaveValue(room);
      await vi.waitFor(() => {
        expect(rowIds().length).toBeGreaterThan(0);
      });
    });
  });

  describe('the date filters', () => {
    const day = () => first20()[0].startsAt.slice(0, 10);
    const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/');

    it('has a From date and a To date, named so', async () => {
      await open();
      await loaded(first20());

      expect(screen.getByRole('textbox', { name: 'From date' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'To date' })).toBeInTheDocument();
    });

    it('says that the days are counted in UTC, by the start of a booking', async () => {
      await open();
      await loaded(first20());

      for (const name of ['From date', 'To date']) {
        expect(screen.getByRole('textbox', { name })).toHaveAccessibleDescription(
          'Filters by the day a booking starts, counted in UTC.',
        );
      }
    });

    it('narrows the list to the bookings from a day on, with one request', async () => {
      const { location } = await open();
      await loaded(first20());
      requests.length = 0;
      const from = day();

      await type('From date', ddmmyyyy(from));

      await vi.waitFor(() => {
        expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1', from }]);
      });
      await loaded(bookingsWhere((b) => b.startsAt.slice(0, 10) >= from).slice(0, 20));
      expect(location.path()).toBe(`/bookings?from=${from}`);
    });

    it('narrows the list to the bookings up to a day, that day included', async () => {
      const { location } = await open();
      await loaded(first20());
      const to = day();

      await type('To date', ddmmyyyy(to));

      await loaded(bookingsWhere((b) => b.startsAt.slice(0, 10) <= to).slice(0, 20));
      expect(location.path()).toBe(`/bookings?to=${to}`);
    });

    it('shows one day when both ends are that day', async () => {
      const target = day();
      const { location } = await open(`/bookings?from=${target}&to=${target}`);

      await loaded(bookingsWhere((b) => b.startsAt.slice(0, 10) === target).slice(0, 20));
      expect(screen.getByRole('textbox', { name: 'From date' })).toHaveValue(ddmmyyyy(target));
      expect(screen.getByRole('textbox', { name: 'To date' })).toHaveValue(ddmmyyyy(target));
      expect(location.path()).toBe(`/bookings?from=${target}&to=${target}`);
    });

    it('takes a date from the calendar, and offers no day before From in the To calendar', async () => {
      const { location } = await open('/bookings?from=2026-10-14');
      await loaded(bookingsWhere((b) => b.startsAt.slice(0, 10) >= '2026-10-14').slice(0, 20));

      await userEvent.click(screen.getByRole('button', { name: 'Choose the last day' }));
      expect(await screen.findByRole('button', { name: '13 Oct 2026' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await userEvent.click(screen.getByRole('button', { name: '20 Oct 2026' }));

      await vi.waitFor(() => {
        expect(location.path()).toBe('/bookings?from=2026-10-14&to=2026-10-20');
      });
      expect(screen.getByRole('textbox', { name: 'To date' })).toHaveValue('20/10/2026');
    });

    it('takes To off when From is set after it, so the two never contradict each other', async () => {
      const { location } = await open('/bookings?from=2026-10-01&to=2026-10-10');
      await vi.waitFor(() => {
        expect(rowIds().length).toBeGreaterThan(0);
      });

      await userEvent.clear(screen.getByRole('textbox', { name: 'From date' }));
      await type('From date', '20/10/2026');

      await vi.waitFor(() => {
        expect(location.path()).toBe('/bookings?from=2026-10-20');
      });
      await vi.waitFor(() => {
        expect(screen.getByRole('textbox', { name: 'To date' })).toHaveValue('');
      });
    });

    it('takes From off when To is set before it', async () => {
      const { location } = await open('/bookings?from=2026-10-20&to=2026-10-25');
      await vi.waitFor(() => {
        expect(location.path()).toBe('/bookings?from=2026-10-20&to=2026-10-25');
      });

      await userEvent.clear(screen.getByRole('textbox', { name: 'To date' }));
      await type('To date', '10/10/2026');

      await vi.waitFor(() => {
        expect(location.path()).toBe('/bookings?to=2026-10-10');
      });
      await vi.waitFor(() => {
        expect(screen.getByRole('textbox', { name: 'From date' })).toHaveValue('');
      });
    });

    it('empties a date when its text is cleared', async () => {
      const { location } = await open('/bookings?from=2026-10-20');
      await vi.waitFor(() => {
        expect(rowIds().length).toBeGreaterThan(0);
      });

      await userEvent.clear(screen.getByRole('textbox', { name: 'From date' }));

      await vi.waitFor(() => {
        expect(location.path()).toBe('/bookings');
      });
    });

    it('ignores a date the API would refuse', async () => {
      await open('/bookings?from=2026-02-31&to=soon');

      await loaded(first20());
      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1' }]);
    });
  });

  describe('the status and location filters', () => {
    it('narrows the list to one status from page 1 with one request', async () => {
      const { location } = await open('/bookings?limit=10&page=2');
      await loaded(bookingsWhere().slice(10, 20));
      requests.length = 0;

      await pick('Status', 'Pending');

      await loaded(bookingsWhere((b) => b.status === 'pending').slice(0, 10));
      expect(location.path()).toBe('/bookings?limit=10&status=pending');
      expect(requests.map(queryOf)).toEqual([{ limit: '10', page: '1', status: 'pending' }]);
    });

    it('offers every status, and Any status', async () => {
      await open();
      await loaded(first20());

      await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));

      expect((await screen.findAllByRole('option')).map((o) => o.textContent.trim())).toEqual([
        'Any status',
        'Pending',
        'Confirmed',
        'Checked in',
        'Completed',
        'Cancelled',
        'No show',
      ]);
    });

    it('offers the locations by name, and narrows the list to one with a single request', async () => {
      const { location } = await open();
      await loaded(first20());
      requests.length = 0;

      await userEvent.click(screen.getByRole('combobox', { name: 'Location' }));
      expect((await screen.findAllByRole('option')).map((o) => o.textContent.trim())).toEqual([
        'Any location',
        ...api.db.locations.map((l) => l.name).sort((a, b) => a.localeCompare(b)),
      ]);
      await userEvent.click(screen.getByRole('option', { name: 'Canal Yard' }));

      await loaded(bookingsWhere((b) => locationOf(b)?.id === 'loc_4').slice(0, 20));
      expect(location.path()).toBe('/bookings?locationId=loc_4');
      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1', locationId: 'loc_4' }]);
    });

    it('shows a location it does not know as Unknown location, so the filter can be taken off', async () => {
      const { location } = await open('/bookings?locationId=loc_nope');

      expect(await screen.findByText('No bookings match the current filters.')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Location' })).toHaveTextContent(
          'Unknown location',
        );
      });

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

      await loaded(first20());
      expect(location.path()).toBe('/bookings');
    });

    it('ignores a status the API does not know', async () => {
      await open('/bookings?status=bogus');

      await loaded(first20());
      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1' }]);
    });
  });

  describe('a member or a room named by the address', () => {
    const memberLink = () => {
      const booking = first20()[0];
      return { booking, member: memberOf(booking), room: roomOf(booking) };
    };

    it('narrows the list to the member a member’s page links to, and shows who as a chip', async () => {
      const { booking, member } = memberLink();
      await open(`/bookings?memberId=${booking.memberId}`);

      await loaded(bookingsWhere((b) => b.memberId === booking.memberId).slice(0, 20));
      const chip = await screen.findByText(`Member: ${member?.firstName} ${member?.lastName}`);
      expect(screen.getByRole('list', { name: 'Filtering by' })).toContainElement(chip);
      expect(requests.map(queryOf)).toEqual([
        { limit: '20', page: '1', memberId: booking.memberId },
      ]);
    });

    it('narrows the list to a room, and shows which as a chip', async () => {
      const { booking, room } = memberLink();
      await open(`/bookings?roomId=${booking.roomId}`);

      await loaded(bookingsWhere((b) => b.roomId === booking.roomId).slice(0, 20));
      expect(await screen.findByText(`Room: ${room?.name}`)).toBeInTheDocument();
    });

    it('offers Clear filters for it, though nothing else narrows the list', async () => {
      const { booking } = memberLink();
      await open(`/bookings?memberId=${booking.memberId}`);
      await screen.findByText(/^Member: /);

      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    });

    it('takes the filter off with the chip’s remove button, and puts focus in the search box', async () => {
      const { booking } = memberLink();
      const { location } = await open(`/bookings?memberId=${booking.memberId}&status=pending`);
      await screen.findByText(/^Member: /);
      requests.length = 0;

      await userEvent.click(screen.getByRole('button', { name: 'Remove member filter' }));

      await loaded(bookingsWhere((b) => b.status === 'pending').slice(0, 20));
      expect(location.path()).toBe('/bookings?status=pending');
      expect(screen.queryByText(/^Member: /)).not.toBeInTheDocument();
      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1', status: 'pending' }]);
      expect(screen.getByRole('searchbox', { name: 'Search member or room' })).toHaveFocus();
    });

    it('takes a room filter off the same way', async () => {
      const { booking } = memberLink();
      const { location } = await open(`/bookings?roomId=${booking.roomId}`);
      await screen.findByText(/^Room: /);

      await userEvent.click(screen.getByRole('button', { name: 'Remove room filter' }));

      await loaded(first20());
      expect(location.path()).toBe('/bookings');
    });

    it('shows both chips when both are named, and Clear filters takes them off together', async () => {
      const { booking } = memberLink();
      const { location } = await open(
        `/bookings?memberId=${booking.memberId}&roomId=${booking.roomId}`,
      );
      await screen.findByText(/^Room: /);
      await screen.findByText(/^Member: /);
      requests.length = 0;

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

      await loaded(first20());
      expect(location.path()).toBe('/bookings');
      expect(screen.queryByRole('list', { name: 'Filtering by' })).not.toBeInTheDocument();
      expect(requests).toHaveLength(1);
    });

    it('says Unknown member for a member the API does not have, so the filter can be taken off', async () => {
      const { location } = await open('/bookings?memberId=mem_nope');

      expect(await screen.findByText('Unknown member')).toBeInTheDocument();
      expect(await screen.findByText('No bookings match the current filters.')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Remove member filter' }));

      await loaded(first20());
      expect(location.path()).toBe('/bookings');
    });

    it('says Unknown room for a room the API does not have', async () => {
      await open('/bookings?roomId=room_nope');

      expect(await screen.findByText('Unknown room')).toBeInTheDocument();
    });

    it('says Unknown member when the lookup fails for another reason too', async () => {
      server.use(
        http.get(apiUrl('/members/:id'), () =>
          HttpResponse.json({ message: 'Boom' }, { status: 500 }),
        ),
      );
      const { booking } = memberLink();
      await open(`/bookings?memberId=${booking.memberId}`);

      expect(await screen.findByText('Unknown member')).toBeInTheDocument();
    });

    it('shows no chip while the name is still on its way', async () => {
      server.use(
        http.get(apiUrl('/rooms/:id'), async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return HttpResponse.json({ message: 'Not found' }, { status: 404 });
        }),
      );
      await open('/bookings?roomId=room_x', { settle: false });

      expect(screen.queryByRole('list', { name: 'Filtering by' })).not.toBeInTheDocument();
      expect(await screen.findByText('Unknown room')).toBeInTheDocument();
    });
  });

  describe('clearing the filters', () => {
    it('is offered only while something narrows the list', async () => {
      await open();
      await loaded(first20());
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

      await pick('Status', 'Pending');

      expect(await screen.findByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    });

    it('empties the search, the dates and every filter together, with one request', async () => {
      const { location } = await open(
        '/bookings?q=a&from=2026-10-01&to=2026-12-31&status=confirmed&locationId=loc_4',
      );
      await vi.waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      requests.length = 0;

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

      await loaded(first20());
      expect(location.path()).toBe('/bookings');
      expect(requests).toHaveLength(1);
      expect(screen.getByRole('searchbox', { name: 'Search member or room' })).toHaveValue('');
      expect(screen.getByRole('textbox', { name: 'From date' })).toHaveValue('');
      expect(screen.getByRole('textbox', { name: 'To date' })).toHaveValue('');
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Any status');
      expect(screen.getByRole('combobox', { name: 'Location' })).toHaveTextContent('Any location');
    });
  });

  describe('pagination', () => {
    it('moves to the next page: the URL changes and exactly one request goes out', async () => {
      const { location } = await open('/bookings?limit=10');
      await loaded(bookingsWhere().slice(0, 10));
      requests.length = 0;

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

      await loaded(bookingsWhere().slice(10, 20));
      expect(location.path()).toBe('/bookings?limit=10&page=2');
      expect(requests.map(queryOf)).toEqual([{ limit: '10', page: '2' }]);
    });
  });

  describe('when there is nothing to show', () => {
    it('says that no bookings match the filters', async () => {
      await open('/bookings?q=zzzz');

      expect(await screen.findByText('No bookings match the current filters.')).toBeInTheDocument();
    });

    it('says there are no bookings yet when there are none', async () => {
      api.db.bookings = [];

      await open();

      expect(await screen.findByText('No bookings yet.')).toBeInTheDocument();
    });
  });

  describe('when the load fails', () => {
    it('shows the reason in the table and loads the list again on request', async () => {
      server.use(
        http.get(
          apiUrl('/bookings'),
          () => HttpResponse.json({ message: 'Boom' }, { status: 500 }),
          {
            once: true,
          },
        ),
      );
      await open();

      expect(await screen.findByRole('alert')).toHaveTextContent('Boom');

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      await loaded(first20());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('creating a booking', () => {
    const openForm = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'New booking' }));
      return screen.findByRole('dialog', { name: 'New booking' });
    };

    it('opens the form, saves, and goes to the new booking', async () => {
      const { router } = await open();
      await loaded(first20());
      const dialog = await openForm();
      const room = api.db.rooms.find((r) => r.status === 'available' && r.locationId === 'loc_4');
      const member = api.db.members.find((m) => m.status === 'active');
      if (!room || !member) throw new Error('seed has no room or member');

      await userEvent.type(within(dialog).getByRole('combobox', { name: /^Room/ }), room.name);
      await userEvent.click(
        await screen.findByRole('option', { name: new RegExp(`^${room.name} · Canal Yard`) }),
      );
      await userEvent.type(within(dialog).getByRole('combobox', { name: /^Member/ }), member.email);
      await userEvent.click(await screen.findByRole('option', { name: new RegExp(member.email) }));
      await userEvent.type(within(dialog).getByRole('textbox', { name: /^Date/ }), '02/03/2027');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      await vi.waitFor(() => {
        expect(router.url).toMatch(/^\/bookings\/bk_\w+$/);
      });
      expect(api.db.bookings.some((b) => router.url.endsWith(b.id))).toBe(true);
    });

    it('gives focus back to the New booking button when the form is cancelled', async () => {
      await open();
      await loaded(first20());

      const dialog = await openForm();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'New booking' })).toHaveFocus();
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
      expect(router.url).toBe('/bookings');
    });
  });
});
