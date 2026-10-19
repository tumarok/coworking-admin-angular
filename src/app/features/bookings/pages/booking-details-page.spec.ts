import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { durationHours, formatDateTime, formatMoney, formatTimeRange } from '@shared/util/format';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { delay, http, HttpResponse } from 'msw';
import { BOOKING_ROUTES } from '../bookings.routes';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

describe('BookingDetailsPage', () => {
  // The first Edit fetches the form's chunk (pickers, autocomplete, Zod). Doing it here keeps that
  // one-off cost out of the test that opens it, which would otherwise race the 5 s wait.
  beforeAll(async () => {
    await import('../dialogs/booking-form-dialog');
  });

  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    requests = [];
    server.events.on('request:start', ({ request }) => {
      requests.push(`${request.method} ${new URL(request.url).pathname.replace('/api/v1', '')}`);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  async function open(url: string, { settle = true } = {}) {
    const view = await render(Outlet, {
      providers: provideTestSession([{ path: 'bookings', children: BOOKING_ROUTES }]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    // Stable means every request has been answered, which a test of the loading state must not wait for.
    if (settle) await view.fixture.whenStable();
    return { ...view, router };
  }

  const withStatus = (status: string) => {
    const booking = api.db.bookings.find((b) => b.status === status);
    if (!booking) throw new Error(`seed has no ${status} booking`);
    return booking;
  };
  type Stored = ReturnType<typeof withStatus>;
  const roomOf = (b: Stored) => api.db.rooms.find((r) => r.id === b.roomId);
  const locationOf = (b: Stored) => api.db.locations.find((l) => l.id === roomOf(b)?.locationId);
  const memberOf = (b: Stored) => api.db.members.find((m) => m.id === b.memberId);
  const fullName = (b: Stored) => `${memberOf(b)?.firstName} ${memberOf(b)?.lastName}`;
  const clockOf = (b: Stored) => locationOf(b)?.timezone ?? 'UTC';

  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');
  const valueOf = (label: string) =>
    screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;
  const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name });
  const titleOf = (b: Stored) =>
    `${roomOf(b)?.name}, ${formatTimeRange(b.startsAt, b.endsAt, clockOf(b))}`;

  describe('a booking', () => {
    it('is titled with its room and its time, under a link back to the list', async () => {
      const booking = withStatus('confirmed');

      await open(`/bookings/${booking.id}`);

      expect(await heading(titleOf(booking))).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Bookings' })).toHaveAttribute('href', '/bookings');
    });

    it('shows its status as a chip under the title', async () => {
      const booking = withStatus('checked_in');

      await open(`/bookings/${booking.id}`);
      await heading(titleOf(booking));

      const chip = screen.getByText('Checked in');
      expect(chip.closest('app-status-chip')).not.toBeNull();
      expect(chip.closest('.actions')).toBeNull();
    });

    it('shows the facts about it', async () => {
      const booking = withStatus('confirmed');
      await open(`/bookings/${booking.id}`);
      await heading(titleOf(booking));

      const clock = clockOf(booking);
      expect(valueOf('Room')).toHaveTextContent(roomOf(booking)?.name ?? '');
      expect(valueOf('Location')).toHaveTextContent(locationOf(booking)?.name ?? '');
      expect(valueOf('Member')).toHaveTextContent(fullName(booking));
      expect(valueOf('Starts')).toHaveTextContent(formatDateTime(booking.startsAt, clock));
      expect(valueOf('Ends')).toHaveTextContent(formatDateTime(booking.endsAt, clock));
      expect(valueOf('Duration')).toHaveTextContent(
        `${durationHours(booking.startsAt, booking.endsAt)} h`,
      );
      expect(valueOf('Attendees')).toHaveTextContent(String(booking.attendees));
      expect(valueOf('Price')).toHaveTextContent(formatMoney(booking.totalPrice));
      expect(valueOf('Created')).toHaveTextContent(formatDateTime(booking.createdAt, clock));
      expect(valueOf('Notes')).toHaveTextContent(booking.notes ?? '—');
    });

    it('writes a duration that is not whole hours as it is: 1.5 h', async () => {
      const booking = withStatus('confirmed');
      booking.startsAt = '2026-12-01T10:00:00.000Z';
      booking.endsAt = '2026-12-01T11:30:00.000Z';
      await open(`/bookings/${booking.id}`);
      await heading(/./);

      expect(valueOf('Duration')).toHaveTextContent(/^1\.5 h$/);
    });

    it('rounds a duration to two decimals, without trailing zeros', async () => {
      const booking = withStatus('confirmed');
      booking.startsAt = '2026-12-01T10:20:00.000Z';
      booking.endsAt = '2026-12-01T10:40:00.000Z';
      await open(`/bookings/${booking.id}`);
      await heading(/./);
      expect(valueOf('Duration')).toHaveTextContent(/^0\.33 h$/);
    });

    it('shows the notes, or a dash when there are none', async () => {
      const booking = withStatus('confirmed');
      booking.notes = 'Bring the cables';
      await open(`/bookings/${booking.id}`);
      await heading(/./);
      expect(valueOf('Notes')).toHaveTextContent('Bring the cables');
    });

    it('shows a dash for notes that are missing', async () => {
      const booking = withStatus('confirmed');
      booking.notes = null;
      await open(`/bookings/${booking.id}`);
      await heading(/./);

      expect(valueOf('Notes')).toHaveTextContent('—');
    });

    it('links to its room, its location and its member', async () => {
      const booking = withStatus('confirmed');
      await open(`/bookings/${booking.id}`);
      await heading(titleOf(booking));

      expect(
        within(valueOf('Room')).getByRole('link', { name: roomOf(booking)?.name }),
      ).toHaveAttribute('href', `/rooms/${booking.roomId}`);
      expect(
        within(valueOf('Location')).getByRole('link', { name: locationOf(booking)?.name }),
      ).toHaveAttribute('href', `/locations/${locationOf(booking)?.id}`);
      expect(
        within(valueOf('Member')).getByRole('link', { name: fullName(booking) }),
      ).toHaveAttribute('href', `/members/${booking.memberId}`);
    });

    it('says it is loading until the answer comes', async () => {
      const booking = withStatus('confirmed');
      server.use(
        http.get(apiUrl(`/bookings/${booking.id}`), async () => {
          await delay(200);
          return HttpResponse.json({
            ...booking,
            roomName: 'Room',
            locationId: '',
            locationName: '—',
            memberName: 'Someone',
          });
        }),
      );

      await open(`/bookings/${booking.id}`, { settle: false });

      expect(await screen.findByRole('status')).toHaveTextContent('Loading booking…');
      expect(await heading(/^Room, /)).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('time zones', () => {
    /** A booking of a room in Berlin, around the night the clock goes back there. */
    function berlinBooking() {
      const booking = withStatus('confirmed');
      const room = api.db.rooms.find((r) => r.locationId === 'loc_4');
      if (!room) throw new Error('seed has no room in Berlin');
      booking.roomId = room.id;
      booking.startsAt = '2026-10-25T00:30:00.000Z';
      booking.endsAt = '2026-10-25T03:00:00.000Z';
      booking.createdAt = '2026-10-01T22:30:00.000Z';
      return { booking, room };
    }

    it('reads the title, the start and the end on the clock of the location, across the change', async () => {
      const { booking, room } = berlinBooking();

      await open(`/bookings/${booking.id}`);

      // 00:30 UTC is 02:30 summer time; 03:00 UTC is 04:00 winter time (the clock went back at 01:00 UTC).
      expect(await heading(`${room.name}, 25 Oct 2026, 02:30–04:00`)).toBeInTheDocument();
      expect(valueOf('Starts')).toHaveTextContent('25 Oct 2026, 02:30');
      expect(valueOf('Ends')).toHaveTextContent('25 Oct 2026, 04:00');
      expect(valueOf('Created')).toHaveTextContent('02 Oct 2026, 00:30');
    });

    it('does not count the extra hour of that night as a duration of the wall clock', async () => {
      const { booking } = berlinBooking();

      await open(`/bookings/${booking.id}`);
      await heading(/./);

      // 2.5 real hours between the instants, though the wall shows one and a half.
      expect(valueOf('Duration')).toHaveTextContent(/^2\.5 h$/);
    });

    it('waits for the location’s clock before it draws a time', async () => {
      const { booking } = berlinBooking();
      server.use(
        http.get(apiUrl(`/locations/${locationOf(booking)?.id}`), async () => {
          await delay(200);
          return HttpResponse.json({ ...locationOf(booking), roomCount: 1 });
        }),
      );

      await open(`/bookings/${booking.id}`, { settle: false });

      await vi.waitFor(() => {
        expect(requests).toContain(`GET /bookings/${booking.id}`);
      });
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Loading booking…');
      expect(await heading(/25 Oct 2026, 02:30–04:00/)).toBeInTheDocument();
    });

    it('reads in UTC, and says so, when the clock of the location cannot be loaded', async () => {
      const { booking } = berlinBooking();
      server.use(
        http.get(apiUrl('/locations/:id'), () =>
          HttpResponse.json({ message: 'Boom' }, { status: 500 }),
        ),
      );

      await open(`/bookings/${booking.id}`);

      expect(await heading(/25 Oct 2026, 00:30–03:00 UTC$/)).toBeInTheDocument();
      expect(valueOf('Starts')).toHaveTextContent('25 Oct 2026, 00:30 UTC');
    });
  });

  describe('a booking whose room, member or location was deleted', () => {
    it('says Deleted room, instead of a link, and says the location is not known', async () => {
      const booking = withStatus('confirmed');
      api.db.rooms = api.db.rooms.filter((r) => r.id !== booking.roomId);

      await open(`/bookings/${booking.id}`);

      expect(await heading(/^Deleted room, /)).toBeInTheDocument();
      expect(valueOf('Room')).toHaveTextContent('Deleted room');
      expect(within(valueOf('Room')).queryByRole('link')).not.toBeInTheDocument();
      expect(valueOf('Location')).toHaveTextContent('Unknown location');
      expect(within(valueOf('Location')).queryByRole('link')).not.toBeInTheDocument();
      expect(valueOf('Starts')).toHaveTextContent(/ UTC$/);
    });

    it('says Deleted member, instead of a link', async () => {
      const booking = withStatus('confirmed');
      api.db.members = api.db.members.filter((m) => m.id !== booking.memberId);

      await open(`/bookings/${booking.id}`);
      await heading(titleOf(booking));

      expect(valueOf('Member')).toHaveTextContent('Deleted member');
      expect(within(valueOf('Member')).queryByRole('link')).not.toBeInTheDocument();
      expect(within(valueOf('Room')).getByRole('link')).toBeInTheDocument();
    });

    it('says Deleted location, instead of a link, when only the location is gone', async () => {
      const booking = withStatus('confirmed');
      const location = locationOf(booking);
      api.db.locations = api.db.locations.filter((l) => l.id !== location?.id);

      await open(`/bookings/${booking.id}`);
      await heading(/./);

      expect(valueOf('Location')).toHaveTextContent('Deleted location');
      expect(within(valueOf('Location')).queryByRole('link')).not.toBeInTheDocument();
      expect(within(valueOf('Room')).getByRole('link')).toBeInTheDocument();
    });
  });

  describe('the buttons for the next status', () => {
    it.each([
      ['pending', ['Confirm', 'Cancel booking', 'Edit']],
      ['confirmed', ['Check in', 'Cancel booking', 'No-show', 'Edit']],
      ['checked_in', ['Complete']],
      ['completed', []],
      ['cancelled', []],
      ['no_show', []],
    ])('are, for a %s booking, %j', async (status, expected) => {
      const booking = withStatus(status);

      await open(`/bookings/${booking.id}`);
      await heading(/./);

      expect(screen.queryAllByRole('button').map((b) => b.textContent.trim())).toEqual(expected);
    });

    it('moves the booking when one is pressed: the chip, the buttons and a snackbar follow', async () => {
      const booking = withStatus('pending');
      await open(`/bookings/${booking.id}`);
      await heading(/./);

      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await vi.waitFor(() => {
        expect(screen.getByText('Confirmed')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Check in' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
      await vi.waitFor(() => {
        expect(snackbars()[0]).toHaveTextContent('Booking confirmed');
      });
    });

    it('tells a refusal (409) in a snackbar and stays where it is', async () => {
      const booking = withStatus('pending');
      await open(`/bookings/${booking.id}`);
      await heading(/./);
      booking.status = 'cancelled';

      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Cannot change status from cancelled to confirmed');
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('opens the form with the booking, and shows the saved booking when it closes', async () => {
      const booking = withStatus('confirmed');
      await open(`/bookings/${booking.id}`);
      await heading(titleOf(booking));

      await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
      const dialog = await screen.findByRole('dialog', { name: 'Edit booking' });
      await userEvent.type(
        within(dialog).getByRole('textbox', { name: /^Notes/ }),
        'Moved to the east wing',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      await vi.waitFor(() => {
        expect(valueOf('Notes')).toHaveTextContent('Moved to the east wing');
      });
      expect(booking.notes).toBe('Moved to the east wing');
    });

    it('stays on the booking, with focus on Edit, while the clock of a new location is on its way', async () => {
      const booking = withStatus('confirmed');
      const from = api.db.rooms.find((r) => r.id === booking.roomId);
      const to = api.db.rooms.find(
        (r) => r.locationId === 'loc_2' && r.status === 'available' && r.id !== from?.id,
      );
      const source = api.db.rooms.find((r) => r.locationId === 'loc_1' && r.status === 'available');
      if (!to || !source) throw new Error('seed has no rooms in loc_1 and loc_2');
      Object.assign(booking, {
        roomId: source.id,
        attendees: 1,
        startsAt: '2027-03-02T09:00:00.000Z',
        endsAt: '2027-03-02T10:00:00.000Z',
      });
      await open(`/bookings/${booking.id}`);
      await heading(/./);
      // The form asks for the new location at once; the page asks again after the save, once the
      // cached answer has expired, and that answer is slow.
      let asked = 0;
      server.use(
        http.get(apiUrl('/locations/loc_2'), async () => {
          if (++asked > 1) await delay(400);
          return HttpResponse.json({ ...api.db.locations[1], roomCount: 1 });
        }),
      );

      await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
      const dialog = await screen.findByRole('dialog', { name: 'Edit booking' });
      const room = within(dialog).getByRole('combobox', { name: /^Room/ });
      await userEvent.clear(room);
      await userEvent.type(room, to.name);
      await userEvent.click(
        await screen.findByRole('option', {
          name: new RegExp(`^${to.name} · ${api.db.locations[1].name}`),
        }),
      );
      const save = within(dialog).getByRole('button', { name: 'Save' });
      await vi.waitFor(() => {
        expect(save).toBeEnabled();
      });
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 120_000);
      try {
        await userEvent.click(save);
        await vi.waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
      } finally {
        vi.useRealTimers();
      }

      // The booking has moved to a room whose location's clock is still being fetched.
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`${to.name}, `);
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
    });

    it('gives focus back to Edit when the form is cancelled', async () => {
      const booking = withStatus('pending');
      await open(`/bookings/${booking.id}`);
      await heading(/./);

      await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
      const dialog = await screen.findByRole('dialog', { name: 'Edit booking' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
      });
    });
  });

  describe('a booking that cannot be shown', () => {
    it('says it was not found, with a way back to the list', async () => {
      await open('/bookings/bk_nope');

      expect(await heading('Booking not found')).toBeInTheDocument();
      expect(screen.getByText('Check the link and try again.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'All bookings' })).toHaveAttribute(
        'href',
        '/bookings',
      );
    });

    it('says it could not be loaded, with the reason, and loads again on request', async () => {
      const booking = withStatus('confirmed');
      server.use(
        http.get(
          apiUrl(`/bookings/${booking.id}`),
          () => HttpResponse.json({ message: 'Boom' }, { status: 500 }),
          { once: true },
        ),
      );
      await open(`/bookings/${booking.id}`);

      expect(await heading('Could not load the booking')).toBeInTheDocument();
      expect(screen.getByText('Boom', { selector: 'p' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await heading(titleOf(booking))).toBeInTheDocument();
    });
  });
});
