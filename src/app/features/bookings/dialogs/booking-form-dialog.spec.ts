import { OverlayContainer } from '@angular/cdk/overlay';
import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Booking, Room } from '@shared/api/contract';
import { formatTimeRange } from '@shared/util/format';
import { utcToZoned, zonedToUtcIso } from '@shared/util/timezone';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { bookableSlot, findBookedSlot, installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { delay, http, HttpResponse } from 'msw';
import type { BookingFormStart } from './booking-form-values';
import { injectBookingFormDialog } from './open-booking-form';

@Component({
  template: '<button type="button" (click)="open()">Open form</button>',
})
class Opener {
  private readonly openForm = injectBookingFormDialog();
  start: BookingFormStart | undefined;
  results: (Booking | undefined)[] = [];
  async open() {
    this.results.push(await this.openForm(this.start));
  }
}

describe('BookingFormDialog', () => {
  // The first open fetches the form's chunk (pickers, autocomplete, Zod). Doing it here keeps that
  // one-off cost out of the first test, which would otherwise race the 5 s wait.
  beforeAll(async () => {
    await import('./booking-form-dialog');
  });

  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      requests.push(`${request.method} ${url.pathname.replace('/api/v1', '')}${url.search}`);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  const writes = () => requests.filter((r) => !r.startsWith('GET'));
  const searches = (what: 'rooms' | 'members') =>
    requests.filter((r) => r.startsWith(`GET /${what}?`));

  // --- the data the tests need ------------------------------------------------------------------
  const locationOf = (room: { locationId: string }) =>
    api.db.locations.find((l) => l.id === room.locationId);
  const roomLabel = (room: Pick<Room, 'name' | 'locationId' | 'capacity'>) =>
    `${room.name} · ${locationOf(room)?.name} (${room.capacity} seats)`;
  const memberLabel = (m: { firstName: string; lastName: string; email: string }) =>
    `${m.firstName} ${m.lastName} · ${m.email}`;
  /** An available room of a location, which a booking can be made in, with the fewest seats among those that hold three or more. */
  const roomAt = (locationId: string) => {
    const room = api.db.rooms
      .filter((r) => r.locationId === locationId && r.status === 'available' && r.capacity >= 3)
      .sort((a, b) => a.capacity - b.capacity)
      .at(0);
    if (!room) throw new Error(`seed has no bookable room at ${locationId}`);
    return room;
  };
  const activeMember = () => {
    const member = api.db.members.find((m) => m.status === 'active');
    if (!member) throw new Error('seed has no active member');
    return member;
  };
  const storedBooking = (status = 'pending') => {
    const booking = api.db.bookings.find((b) => b.status === status);
    if (!booking) throw new Error(`seed has no ${status} booking`);
    return booking;
  };
  /** The API's view of a stored booking, as the page that opens the form holds it. */
  const viewOf = (record: ReturnType<typeof storedBooking>): Booking => {
    const room = api.db.rooms.find((r) => r.id === record.roomId);
    const location = api.db.locations.find((l) => l.id === room?.locationId);
    const member = api.db.members.find((m) => m.id === record.memberId);
    return {
      ...record,
      roomName: room?.name ?? '—',
      locationId: location?.id ?? '',
      locationName: location?.name ?? '—',
      memberName: member ? `${member.firstName} ${member.lastName}` : '—',
    };
  };
  /** The clock of the location of a stored booking's room. */
  const zoneOf = (record: ReturnType<typeof storedBooking>) =>
    locationOf({ locationId: viewOf(record).locationId })?.timezone;
  /** Makes a location open all day, so times near midnight can be booked. */
  const openAllDay = (locationId: string) => {
    const location = locationOf({ locationId });
    if (!location) throw new Error('no such location');
    location.opensAt = '00:00';
    location.closesAt = '23:59';
  };

  // --- opening the dialog and its controls -------------------------------------------------------
  async function open(start?: BookingFormStart) {
    const view = await render(Opener, { providers: provideTestSession() });
    const opener = view.fixture.componentInstance;
    opener.start = start;
    await userEvent.click(screen.getByRole('button', { name: 'Open form' }));
    const dialog = await screen.findByRole('dialog', {
      name: start?.booking ? 'Edit booking' : 'New booking',
    });
    return { ...view, opener, dialog };
  }
  const edit = (record = storedBooking()) => {
    const booking = viewOf(record);
    const timeZone = zoneOf(record);
    return open({ booking, timeZone });
  };

  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');

  const field = {
    room: () => screen.getByRole('combobox', { name: /^Room/ }),
    member: () => screen.getByRole('combobox', { name: /^Member/ }),
    date: () => screen.getByRole('textbox', { name: /^Date/ }),
    from: () => screen.getByRole('combobox', { name: 'From' }),
    to: () => screen.getByRole('combobox', { name: 'To' }),
    attendees: () => screen.getByRole('spinbutton', { name: /^Attendees/ }),
    notes: () => screen.getByRole('textbox', { name: /^Notes/ }),
  };
  /** The live region of an autocomplete field, which says how many records were found. */
  const announced = (control: HTMLElement) =>
    control.closest('app-autocomplete-field')?.querySelector('[role="status"]');
  const save = () => screen.getByRole('button', { name: /^Save|Saving/ });

  async function replace(control: HTMLElement, text: string) {
    await userEvent.clear(control);
    await userEvent.type(control, text);
  }
  async function chooseRoom(room: Room | { name: string; locationId: string; capacity: number }) {
    await userEvent.clear(field.room());
    await userEvent.type(field.room(), room.name);
    await userEvent.click(await screen.findByRole('option', { name: roomLabel(room) }));
  }
  async function chooseMember(member: { firstName: string; lastName: string; email: string }) {
    await userEvent.clear(field.member());
    await userEvent.type(field.member(), member.email);
    await userEvent.click(await screen.findByRole('option', { name: memberLabel(member) }));
  }
  /** A booking of an hour on a day, in a room: everything that makes the form valid. */
  async function fill({
    room = roomAt('loc_4'),
    member = activeMember(),
    date = '02/03/2027',
    start = '10:00',
    end = '11:00',
  } = {}) {
    await chooseRoom(room);
    await chooseMember(member);
    await replace(field.date(), date);
    await replace(field.from(), start);
    await replace(field.to(), end);
  }

  const refuse = (status: number, body: object, method: 'post' | 'patch' = 'post') => {
    server.use(
      http[method](apiUrl('/bookings/:id?'), () => HttpResponse.json(body, { status }), {
        once: true,
      }),
    );
  };

  describe('a new booking', () => {
    it('is a dialog titled "New booking", filled with defaults', async () => {
      const { dialog } = await open();

      expect(dialog).toHaveAccessibleName('New booking');
      expect(field.room()).toHaveValue('');
      expect(field.room()).toHaveAttribute('placeholder', 'Choose a room');
      expect(field.member()).toHaveValue('');
      expect(field.member()).toHaveAttribute('placeholder', 'Choose a member');
      expect(field.date()).toHaveValue('');
      expect(field.from()).toHaveValue('09:00');
      expect(field.to()).toHaveValue('10:00');
      expect(field.attendees()).toHaveValue(1);
      expect(field.notes()).toHaveValue('');
    });

    it('marks the room, the member, the date and the attendees as required', async () => {
      await open();

      for (const control of [field.room, field.member, field.date, field.attendees]) {
        expect(control()).toBeRequired();
      }
      expect(field.notes()).not.toBeRequired();
    });

    it('opens with focus in the first field, the room', async () => {
      await open();

      await vi.waitFor(() => {
        expect(field.room()).toHaveFocus();
      });
    });

    it('is as wide as the spec says, 44rem', async () => {
      const { dialog } = await open();

      expect(dialog.closest('.cdk-overlay-pane')?.getAttribute('style')).toContain('width: 44rem');
    });

    it('cannot be saved until it is valid', async () => {
      await open();
      expect(save()).toBeDisabled();

      await chooseRoom(roomAt('loc_4'));
      await chooseMember(activeMember());
      expect(save()).toBeDisabled();

      await replace(field.date(), '02/03/2027');
      expect(save()).toBeEnabled();
    });

    it('closes without a result, and sends nothing, on Cancel', async () => {
      const { opener, dialog } = await open();
      await fill();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(opener.results).toEqual([undefined]);
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(writes()).toEqual([]);
    });

    it('closes on Escape without a result', async () => {
      const { opener } = await open();
      await vi.waitFor(() => {
        expect(field.room()).toHaveFocus();
      });

      fireEvent.keyDown(field.room(), { key: 'Escape', keyCode: 27 });

      await vi.waitFor(() => {
        expect(opener.results).toEqual([undefined]);
      });
    });
  });

  describe('choosing a room', () => {
    it('asks the server for the first 20 rooms that can be booked, and lists them as "name · location (n seats)"', async () => {
      await open();

      await userEvent.click(field.room());

      const options = await screen.findAllByRole('option');
      expect(searches('rooms')).toEqual(['GET /rooms?limit=20&page=1&status=available']);
      const available = api.db.rooms
        .filter((r) => r.status === 'available')
        .sort(
          (a, b) =>
            (locationOf(a)?.name ?? '').localeCompare(locationOf(b)?.name ?? '') ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 20);
      expect(options.map((o) => o.textContent.trim())).toEqual(available.map(roomLabel));
    });

    it('does not offer a room that is in maintenance or retired', async () => {
      const closed = api.db.rooms.find((r) => r.status !== 'available');
      if (!closed) throw new Error('seed has no closed room');
      await open();

      await userEvent.type(field.room(), closed.name);
      await vi.waitFor(() => {
        expect(searches('rooms')).toHaveLength(2);
      });

      expect(screen.queryByRole('option', { name: roomLabel(closed) })).not.toBeInTheDocument();
    });

    it('searches on the server once the typing settles: one request for the whole text', async () => {
      await open();
      await vi.waitFor(() => {
        expect(searches('rooms')).toHaveLength(1);
      });

      await userEvent.type(field.room(), 'aurora');

      await vi.waitFor(() => {
        expect(searches('rooms')).toEqual([
          'GET /rooms?limit=20&page=1&status=available',
          'GET /rooms?limit=20&page=1&q=aurora&status=available',
        ]);
      });
    });

    it('lists what the server found', async () => {
      const room = roomAt('loc_4');
      await open();

      await userEvent.type(field.room(), room.name);

      await vi.waitFor(() => {
        expect(
          screen
            .getAllByRole('option')
            .every((o) => o.textContent.toLowerCase().includes(room.name.toLowerCase())),
        ).toBe(true);
      });
      expect(await screen.findByRole('option', { name: roomLabel(room) })).toBeInTheDocument();
    });

    it('says when nothing matches', async () => {
      await open();

      await userEvent.type(field.room(), 'zzzz-no-such-room');

      expect(await screen.findByRole('option', { name: 'No matches' })).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(announced(field.room())).toHaveTextContent('No matches');
      });
    });

    it('announces how many rooms the search found', async () => {
      await open();
      const available = api.db.rooms.filter((r) => r.status === 'available').length;

      await userEvent.click(field.room());

      await vi.waitFor(() => {
        expect(announced(field.room())).toHaveTextContent(
          `${available} matches, showing the first 20`,
        );
      });
    });

    it('puts the room’s label in the box and the room’s clock under the date, once it is chosen', async () => {
      const room = roomAt('loc_4');
      await open();

      await chooseRoom(room);

      expect(field.room()).toHaveValue(roomLabel(room));
      const location = locationOf(room);
      const hint = `${location?.name} local time (${location?.timezone}), open ${location?.opensAt}–${location?.closesAt}`;
      expect(await screen.findByText(hint)).toBeInTheDocument();
      expect(field.date()).toHaveAccessibleDescription(hint);
    });

    it('shows no hint before a room is chosen', async () => {
      await open();

      expect(screen.queryByText(/local time \(/)).not.toBeInTheDocument();
    });

    it('takes the choice back when the text is edited, and asks for a room', async () => {
      await open();
      await chooseRoom(roomAt('loc_4'));

      await userEvent.type(field.room(), 'x');
      await userEvent.tab();

      expect(field.room()).toHaveAccessibleDescription('Choose a room');
      expect(field.room()).toBeInvalid();
      expect(screen.queryByText(/local time \(/)).not.toBeInTheDocument();
    });

    it('asks for a room when the box is left alone', async () => {
      await open();
      await vi.waitFor(() => {
        expect(field.room()).toHaveFocus();
      });

      await userEvent.tab();

      await vi.waitFor(() => {
        expect(field.room()).toHaveAccessibleDescription('Choose a room');
      });
    });

    it('says so under the field when the rooms cannot be loaded', async () => {
      server.use(
        http.get(apiUrl('/rooms'), () => HttpResponse.json({ message: 'Boom' }, { status: 500 })),
      );
      await open();

      expect(
        await screen.findByText('The rooms could not be loaded. Close the form and try again.'),
      ).toBeInTheDocument();
    });
  });

  describe('choosing a member', () => {
    it('asks the server for the first 20 active members, and lists them as "Name · email"', async () => {
      await open();

      await userEvent.click(field.member());

      const options = await screen.findAllByRole('option');
      expect(searches('members')).toEqual(['GET /members?limit=20&page=1&status=active']);
      const active = api.db.members
        .filter((m) => m.status === 'active')
        .sort(
          (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
        )
        .slice(0, 20);
      expect(options.map((o) => o.textContent.trim())).toEqual(active.map(memberLabel));
    });

    it('does not offer a member who is suspended', async () => {
      const suspended = api.db.members.find((m) => m.status === 'suspended');
      if (!suspended) throw new Error('seed has no suspended member');
      await open();

      await userEvent.type(field.member(), suspended.email);
      await vi.waitFor(() => {
        expect(searches('members')).toHaveLength(2);
      });

      expect(
        screen.queryByRole('option', { name: memberLabel(suspended) }),
      ).not.toBeInTheDocument();
    });

    it('finds a member by email on the server, and puts their label in the box', async () => {
      const member = activeMember();
      await open();

      await chooseMember(member);

      expect(field.member()).toHaveValue(memberLabel(member));
      expect(decodeURIComponent(searches('members').at(-1) ?? '')).toContain(`q=${member.email}`);
    });

    it('asks for a member once the box was visited and left empty', async () => {
      await open();

      await userEvent.click(field.member());
      await userEvent.tab();

      await vi.waitFor(() => {
        expect(field.member()).toHaveAccessibleDescription('Choose a member');
      });
    });

    it('says so under the field when the members cannot be loaded', async () => {
      server.use(
        http.get(apiUrl('/members'), () => HttpResponse.json({ message: 'Boom' }, { status: 500 })),
      );
      await open();

      expect(
        await screen.findByText('The members could not be loaded. Close the form and try again.'),
      ).toBeInTheDocument();
    });
  });

  describe('creating the booking', () => {
    it('creates it, says so, closes and hands the new booking on', async () => {
      const room = roomAt('loc_4');
      const member = activeMember();
      const { opener } = await open();
      await fill({ room, member });
      await replace(field.attendees(), '3');
      await userEvent.type(field.notes(), '  Projector please ');

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      const created = api.db.bookings.at(-1);
      expect(created).toMatchObject({
        roomId: room.id,
        memberId: member.id,
        attendees: 3,
        notes: 'Projector please',
        status: 'pending',
      });
      expect(opener.results).toEqual([expect.objectContaining({ id: created?.id })]);
      expect(writes()).toEqual(['POST /bookings']);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent(
        `Booking created: ${room.name}, 02 Mar 2027, 10:00–11:00`,
      );
    });

    it('sends empty notes as null', async () => {
      await open();
      await fill();

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(api.db.bookings.at(-1)?.notes).toBeNull();
      });
    });

    it('reads the day and the times on the clock of the room’s location (Berlin, winter time)', async () => {
      const room = roomAt('loc_4');
      await open();
      await fill({ room, date: '02/03/2027', start: '10:00', end: '11:00' });

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(api.db.bookings.at(-1)?.roomId).toBe(room.id);
      });
      // Berlin is one hour ahead of UTC in March, until the clock goes forward on the 28th.
      expect(api.db.bookings.at(-1)).toMatchObject({
        startsAt: '2027-03-02T09:00:00.000Z',
        endsAt: '2027-03-02T10:00:00.000Z',
      });
    });

    it('reads the same clock time as an hour earlier in UTC once the clock has gone forward', async () => {
      const room = roomAt('loc_4');
      await open();
      await fill({ room, date: '29/03/2027', start: '10:00', end: '11:00' });

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(api.db.bookings.at(-1)?.roomId).toBe(room.id);
      });
      // 28 March 2027 is the day Berlin goes to summer time (UTC+2); the 29th is after it.
      expect(api.db.bookings.at(-1)?.startsAt).toBe('2027-03-29T08:00:00.000Z');
    });

    it('reads a room in another zone on that zone’s clock, whatever the room chosen before was', async () => {
      const berlin = roomAt('loc_4');
      const kyiv = roomAt('loc_1');
      await open();
      await fill({ room: berlin });
      await chooseRoom(kyiv);

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(api.db.bookings.at(-1)?.roomId).toBe(kyiv.id);
      });
      // Kyiv is two hours ahead of UTC in March.
      expect(api.db.bookings.at(-1)?.startsAt).toBe('2027-03-02T08:00:00.000Z');
    });

    it('does not use the browser’s time zone: the same entry gives the same instant', async () => {
      const room = roomAt('loc_4');
      await open();
      await fill({ room });
      await userEvent.click(save());
      await vi.waitFor(() => {
        expect(api.db.bookings.at(-1)?.roomId).toBe(room.id);
      });

      expect(api.db.bookings.at(-1)?.startsAt).toBe(
        zonedToUtcIso('2027-03-02', '10:00', 'Europe/Berlin'),
      );
    });

    it('prefills the room and the member when they are given', async () => {
      const room = roomAt('loc_4');
      const member = activeMember();
      await open({ roomId: room.id, memberId: member.id });

      await vi.waitFor(() => {
        expect(field.room()).toHaveValue(roomLabel(room));
      });
      await vi.waitFor(() => {
        expect(field.member()).toHaveValue(memberLabel(member));
      });
      expect(save()).toBeDisabled();
      await replace(field.date(), '02/03/2027');
      await vi.waitFor(() => {
        expect(save()).toBeEnabled();
      });
    });

    it('shows a room that was prefilled but is not among the first matches, and its clock', async () => {
      const room = api.db.rooms.filter((r) => r.status === 'available').at(-1);
      if (!room) throw new Error('seed has no room');
      await open({ roomId: room.id });

      await vi.waitFor(() => {
        expect(field.room()).toHaveValue(roomLabel(room));
      });
      expect(await screen.findByText(/local time \(/)).toBeInTheDocument();
    });

    it('says Unknown room and Unknown member for prefilled ones that do not exist', async () => {
      await open({ roomId: 'room_nope', memberId: 'mem_nope' });

      await vi.waitFor(() => {
        expect(field.room()).toHaveValue('Unknown room');
      });
      expect(field.member()).toHaveValue('Unknown member');
    });
  });

  describe('validation', () => {
    it('shows no error before a field is touched, and words it once the field is left', async () => {
      await open();

      await userEvent.click(field.date());
      expect(screen.queryByText('Pick a date')).not.toBeInTheDocument();
      await userEvent.tab();

      expect(await screen.findByText('Pick a date')).toBeInTheDocument();
      expect(field.date()).toHaveAccessibleDescription('Pick a date');
      expect(field.date()).toBeInvalid();
    });

    it('asks for a day that exists', async () => {
      await open();

      await replace(field.date(), 'soon');
      await userEvent.tab();

      expect(await screen.findByText('Pick a date')).toBeInTheDocument();
    });

    it('asks for the times as HH:mm', async () => {
      await open();

      await replace(field.from(), 'noon');
      await userEvent.tab();

      expect(await screen.findByText('Use the HH:mm format')).toBeInTheDocument();
      expect(field.from()).toBeInvalid();
    });

    describe('the end of the booking', () => {
      it('must be after the start', async () => {
        await open();
        await chooseRoom(roomAt('loc_4'));

        await replace(field.to(), '08:30');
        await userEvent.tab();

        expect(await screen.findByText('End must be after start')).toBeInTheDocument();
        expect(field.to()).toHaveAccessibleDescription('End must be after start');
        expect(field.to()).toBeInvalid();
      });

      it('must not be the start itself', async () => {
        await open();

        await replace(field.to(), '09:00');
        await userEvent.tab();

        expect(await screen.findByText('End must be after start')).toBeInTheDocument();
      });

      it('may be 8 hours after the start, and not a minute more', async () => {
        await open();
        await chooseRoom(roomAt('loc_4'));
        await replace(field.date(), '02/03/2027');

        await replace(field.to(), '17:00');
        await userEvent.tab();
        expect(
          screen.queryByText('A booking cannot be longer than 8 hours'),
        ).not.toBeInTheDocument();

        await replace(field.to(), '17:01');
        await userEvent.tab();
        expect(
          await screen.findByText('A booking cannot be longer than 8 hours'),
        ).toBeInTheDocument();
        expect(field.to()).toBeInvalid();
      });

      it('shows its error when only the start was touched, as the start is what changed it', async () => {
        await open();
        await replace(field.from(), '11:00');
        // To was never visited. Its value (10:00) is now before the start.
        expect(screen.queryByText('End must be after start')).not.toBeInTheDocument();

        await userEvent.tab();

        expect(await screen.findByText('End must be after start')).toBeInTheDocument();
      });

      it('shows its error when only the date was touched', async () => {
        await open();
        await replace(field.from(), '11:00');
        await userEvent.tab();
        await userEvent.tab();
        await userEvent.tab();

        await replace(field.date(), '02/03/2027');
        await userEvent.tab();

        expect(screen.getByText('End must be after start')).toBeInTheDocument();
      });

      it('goes away when the times are fixed', async () => {
        await open();
        await replace(field.to(), '08:00');
        await userEvent.tab();
        await screen.findByText('End must be after start');

        await replace(field.to(), '12:00');

        expect(screen.queryByText('End must be after start')).not.toBeInTheDocument();
        expect(field.to()).toBeValid();
      });

      it('keeps Save off while it is wrong', async () => {
        await open();
        await fill({ start: '11:00', end: '10:00' });

        expect(save()).toBeDisabled();
      });
    });

    describe('around a change of the clock (Berlin, 2026-10-25, a day of 25 hours)', () => {
      beforeEach(() => {
        openAllDay('loc_4');
      });

      it('counts the hours between the instants: 00:30–08:30 on the wall is 9 hours', async () => {
        await open();
        await chooseRoom(roomAt('loc_4'));
        await replace(field.date(), '25/10/2026');

        await replace(field.from(), '00:30');
        await replace(field.to(), '08:30');
        await userEvent.tab();

        expect(
          await screen.findByText('A booking cannot be longer than 8 hours'),
        ).toBeInTheDocument();
        expect(save()).toBeDisabled();
      });

      it('takes 00:30–07:30 on the wall, which is exactly 8 hours, and the server agrees', async () => {
        const room = roomAt('loc_4');
        await open();
        await fill({ room, date: '25/10/2026', start: '00:30', end: '07:30' });
        expect(
          screen.queryByText('A booking cannot be longer than 8 hours'),
        ).not.toBeInTheDocument();

        await userEvent.click(save());

        await vi.waitFor(() => {
          expect(api.db.bookings.at(-1)?.roomId).toBe(room.id);
        });
        expect(api.db.bookings.at(-1)).toMatchObject({
          startsAt: '2026-10-24T22:30:00.000Z',
          endsAt: '2026-10-25T06:30:00.000Z',
        });
      });

      it('takes 8 hours on the wall the day before, when no hour is added', async () => {
        await open();
        await chooseRoom(roomAt('loc_4'));
        await replace(field.date(), '24/10/2026');

        await replace(field.from(), '00:30');
        await replace(field.to(), '08:30');
        await userEvent.tab();

        expect(
          screen.queryByText('A booking cannot be longer than 8 hours'),
        ).not.toBeInTheDocument();
      });
    });

    describe('the attendees', () => {
      it('must be a number of at least one person', async () => {
        await open();

        await replace(field.attendees(), '0');
        await userEvent.tab();
        expect(await screen.findByText('At least 1 person')).toBeInTheDocument();
        await userEvent.clear(field.attendees());
        expect(await screen.findByText('Enter a number')).toBeInTheDocument();
        await replace(field.attendees(), '2.5');
        expect(await screen.findByText('Enter a whole number')).toBeInTheDocument();
        expect(save()).toBeDisabled();
      });

      it('may not be more than the room seats, once a room is chosen', async () => {
        const room = roomAt('loc_4');
        await open();
        await chooseRoom(room);

        await replace(field.attendees(), String(room.capacity + 1));
        await userEvent.tab();

        expect(
          await screen.findByText(`This room seats up to ${room.capacity}`),
        ).toBeInTheDocument();
        expect(field.attendees()).toBeInvalid();
        expect(save()).toBeDisabled();
      });

      it('may be as many as the room seats', async () => {
        const room = roomAt('loc_4');
        await open();
        await chooseRoom(room);

        await replace(field.attendees(), String(room.capacity));
        await userEvent.tab();

        expect(screen.queryByText(/This room seats up to/)).not.toBeInTheDocument();
      });

      it('is not limited before a room is chosen', async () => {
        await open();

        await replace(field.attendees(), '500');
        await userEvent.tab();

        expect(screen.queryByText(/This room seats up to/)).not.toBeInTheDocument();
        expect(field.attendees()).toBeValid();
      });

      it('is judged again when another room is chosen', async () => {
        const small = roomAt('loc_4');
        const big = api.db.rooms.find(
          (r) =>
            r.status === 'available' &&
            locationOf(r)?.status === 'active' &&
            r.capacity > small.capacity + 5,
        );
        if (!big) throw new Error('seed has no bigger room');
        await open();
        await chooseRoom(small);
        await replace(field.attendees(), String(small.capacity + 5));
        await userEvent.tab();
        await screen.findByText(`This room seats up to ${small.capacity}`);

        await chooseRoom(big);

        await vi.waitFor(() => {
          expect(screen.queryByText(/This room seats up to/)).not.toBeInTheDocument();
        });
      });
    });

    it('allows notes up to 500 characters and asks for fewer beyond that', async () => {
      await open();

      await userEvent.click(field.notes());
      await userEvent.paste('x'.repeat(501));
      await userEvent.tab();

      expect(await screen.findByText('At most 500 characters')).toBeInTheDocument();
      expect(save()).toBeDisabled();
    });

    it('shows what is wrong, focuses the first problem and sends nothing when Enter is pressed in an invalid form', async () => {
      await open();
      await chooseRoom(roomAt('loc_4'));
      await userEvent.click(field.date());

      await userEvent.keyboard('{Enter}');

      expect(field.member()).toHaveAccessibleDescription('Choose a member');
      expect(field.member()).toHaveFocus();
      expect(writes()).toEqual([]);
    });

    it('shows what is wrong when the form itself is submitted while invalid', async () => {
      const { dialog } = await open();
      const form = dialog.querySelector('form');
      if (!form) throw new Error('The dialog has no form');

      fireEvent.submit(form);

      expect(await screen.findByText('Choose a room')).toBeInTheDocument();
      expect(screen.getByText('Choose a member')).toBeInTheDocument();
      expect(screen.getByText('Pick a date')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(field.room()).toHaveFocus();
      });
      expect(writes()).toEqual([]);
    });

    it('does not take Enter that chose an option of a list as a request to show the errors', async () => {
      const room = roomAt('loc_4');
      await open();
      await userEvent.type(field.room(), room.name);
      const [first] = await screen.findAllByRole('option');
      const label = first.textContent.trim();

      fireEvent.keyDown(field.room(), { key: 'ArrowDown', keyCode: 40 });
      fireEvent.keyDown(field.room(), { key: 'Enter', keyCode: 13 });

      await vi.waitFor(() => {
        expect(field.room()).toHaveValue(label);
      });
      expect(screen.queryByText('Choose a member')).not.toBeInTheDocument();
      expect(field.room()).toHaveFocus();
    });
  });

  describe('when the room is already booked (409)', () => {
    /** The form filled with the slot of a booking that exists, in its room's location's clock. */
    async function bookTheBookedSlot() {
      const { existing, room, location, member } = findBookedSlot(api);
      const start = utcToZoned(existing.startsAt, location.timezone);
      const end = utcToZoned(existing.endsAt, location.timezone);
      if (!start || !end) throw new Error('unreadable slot');
      const opened = await open();
      await fill({
        room: { ...room, locationId: location.id },
        member,
        date: start.date.split('-').reverse().join('/'),
        start: start.time,
        end: end.time,
      });
      return { ...opened, existing, room, location, member, start, end };
    }

    it('says so in a banner, in bold, with a link to each booking in the way', async () => {
      const { existing, location } = await bookTheBookedSlot();

      await userEvent.click(save());

      const banner = await screen.findByRole('alert');
      expect(within(banner).getByText('The room is already booked for this time.')).toHaveClass(
        'lead',
      );
      const link = within(banner).getByRole('link', {
        name: new RegExp(
          formatTimeRange(existing.startsAt, existing.endsAt, location.timezone).replace('–', '–'),
        ),
      });
      expect(link).toHaveAttribute('href', `/bookings/${existing.id}`);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener');
      expect(within(banner).getAllByRole('listitem')).toHaveLength(1);
    });

    it('formats the bookings in the way on the clock of the room’s location', async () => {
      const { existing, location, start, end } = await bookTheBookedSlot();

      await userEvent.click(save());

      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent(`${start.time}–${end.time}`);
      expect(formatTimeRange(existing.startsAt, existing.endsAt, location.timezone)).toContain(
        `${start.time}–${end.time}`,
      );
    });

    it('keeps the dialog open, with no snackbar, and sends one request', async () => {
      const { opener } = await bookTheBookedSlot();

      await userEvent.click(save());

      await screen.findByRole('alert');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(opener.results).toEqual([]);
      expect(snackbars()).toHaveLength(0);
      expect(writes()).toEqual(['POST /bookings']);
    });

    it('moves focus to the first field, which the disabled fields had lost', async () => {
      await bookTheBookedSlot();

      await userEvent.click(save());

      await screen.findByRole('alert');
      await vi.waitFor(() => {
        expect(field.room()).toHaveFocus();
      });
    });

    it('leaves Save usable, so the same form can be sent again', async () => {
      await bookTheBookedSlot();
      await userEvent.click(save());
      await screen.findByRole('alert');

      expect(save()).toBeEnabled();
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(writes()).toEqual(['POST /bookings', 'POST /bookings']);
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The room is already booked for this time.',
      );
    });

    it('takes the banner away as soon as a time changes, and the booking can then be made', async () => {
      const { opener, end } = await bookTheBookedSlot();
      await userEvent.click(save());
      await screen.findByRole('alert');

      const [hours, minutes] = end.time.split(':').map(Number);
      await replace(
        field.from(),
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      );
      await replace(
        field.to(),
        `${String(hours + 1).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      await userEvent.click(save());
      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
    });

    it('takes the banner away when the day changes', async () => {
      await bookTheBookedSlot();
      await userEvent.click(save());
      await screen.findByRole('alert');

      await replace(field.date(), '03/03/2027');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('takes the banner away when another room is chosen', async () => {
      await bookTheBookedSlot();
      await userEvent.click(save());
      await screen.findByRole('alert');

      await chooseRoom(roomAt('loc_4'));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps the banner while something the clash is not about changes', async () => {
      await bookTheBookedSlot();
      await userEvent.click(save());
      await screen.findByRole('alert');

      await userEvent.type(field.notes(), 'Please');

      expect(screen.getByRole('alert')).toHaveTextContent(
        'The room is already booked for this time.',
      );
      expect(save()).toBeEnabled();
    });

    it('lists every booking in the way', async () => {
      const room = roomAt('loc_4');
      const member = activeMember();
      const location = locationOf(room);
      const slot = (start: string, end: string) => ({
        roomId: room.id,
        memberId: member.id,
        startsAt: zonedToUtcIso('2027-03-02', start, location?.timezone ?? '') ?? '',
        endsAt: zonedToUtcIso('2027-03-02', end, location?.timezone ?? '') ?? '',
      });
      for (const [i, [start, end]] of [
        ['10:00', '10:30'],
        ['10:30', '11:00'],
      ].entries()) {
        api.db.bookings.push({
          id: `bk_blocking_${i}`,
          ...slot(start, end),
          attendees: 1,
          status: 'confirmed',
          notes: null,
          totalPrice: 0,
          createdAt: '2026-10-01T00:00:00.000Z',
        });
      }
      await open();
      await fill({ room });

      await userEvent.click(save());

      const banner = await screen.findByRole('alert');
      expect(
        within(banner)
          .getAllByRole('link')
          .map((a) => a.getAttribute('href')),
      ).toEqual(['/bookings/bk_blocking_0', '/bookings/bk_blocking_1']);
    });

    it('says a 409 without bookings in the way as the server worded it, with no list', async () => {
      await open();
      await fill();
      refuse(409, { message: 'Another admin changed this' });

      await userEvent.click(save());

      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent('Another admin changed this');
      expect(within(banner).queryByRole('list')).not.toBeInTheDocument();
      expect(banner.querySelector('.lead')).toBeNull();
    });

    it('lets the booking be saved once the cause is gone: the other booking is cancelled', async () => {
      const { existing, opener } = await bookTheBookedSlot();
      await userEvent.click(save());
      await screen.findByRole('alert');
      const blocking = api.db.bookings.find((b) => b.id === existing.id);
      if (blocking) blocking.status = 'cancelled';

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
    });
  });

  describe('when the server refuses with field errors (422)', () => {
    it('puts the opening hours message under From, where the server’s startsAt belongs', async () => {
      const location = locationOf(roomAt('loc_4'));
      await open();
      await fill({ start: '06:00', end: '07:00' });

      await userEvent.click(save());

      const message = `Outside opening hours (${location?.opensAt}–${location?.closesAt} local time)`;
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(field.from()).toHaveAccessibleDescription(message);
      expect(field.from()).toBeInvalid();
      expect(field.to()).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(snackbars()).toHaveLength(0);
    });

    it('puts endsAt under To, and attendees, roomId and memberId under their own fields', async () => {
      await open();
      await fill();
      refuse(422, {
        message: 'Validation failed',
        fieldErrors: {
          endsAt: 'Ends too late for this room',
          attendees: 'No room for that',
          roomId: 'This room is not available for booking',
          memberId: 'Member is suspended',
        },
      });

      await userEvent.click(save());

      expect(await screen.findByText('Ends too late for this room')).toBeInTheDocument();
      expect(field.to()).toHaveAccessibleDescription('Ends too late for this room');
      expect(field.attendees()).toHaveAccessibleDescription('No room for that');
      expect(field.room()).toHaveAccessibleDescription('This room is not available for booking');
      expect(field.member()).toHaveAccessibleDescription('Member is suspended');
      expect(screen.queryByRole('alert', { name: /./ })).not.toBeInTheDocument();
    });

    it('moves focus to the first field with an error', async () => {
      await open();
      await fill();
      refuse(422, {
        message: 'Validation failed',
        fieldErrors: { endsAt: 'Too late', attendees: 'No room for that' },
      });

      await userEvent.click(save());

      await screen.findByText('Too late');
      await vi.waitFor(() => {
        expect(field.to()).toHaveFocus();
      });
    });

    it('shows the real API’s refusal for a member who is suspended under Member', async () => {
      const suspended = api.db.members.find((m) => m.status === 'suspended');
      if (!suspended) throw new Error('seed has no suspended member');
      await open();
      await fill();
      const booking = bookableSlot(api);
      server.use(
        http.post(apiUrl('/bookings'), () =>
          HttpResponse.json(
            {
              message: 'Validation failed',
              fieldErrors: { memberId: `Member is ${suspended.status}` },
            },
            { status: 422 },
          ),
        ),
      );

      await userEvent.click(save());

      expect(await screen.findByText('Member is suspended')).toBeInTheDocument();
      expect(booking.input.attendees).toBe(2);
    });

    it('takes a message away when its field is edited, and keeps the others', async () => {
      await open();
      await fill();
      refuse(422, {
        message: 'Validation failed',
        fieldErrors: { endsAt: 'Too late', attendees: 'No room for that' },
      });
      await userEvent.click(save());
      await screen.findByText('Too late');

      await replace(field.to(), '11:30');

      expect(screen.queryByText('Too late')).not.toBeInTheDocument();
      expect(screen.getByText('No room for that')).toBeInTheDocument();
    });

    it('cannot be saved again until the fields with a message are changed', async () => {
      await open();
      await fill();
      refuse(422, { message: 'Validation failed', fieldErrors: { attendees: 'No room for that' } });
      await userEvent.click(save());
      await screen.findByText('No room for that');
      expect(save()).toBeDisabled();

      await replace(field.attendees(), '2');

      expect(save()).toBeEnabled();
    });

    it('puts a field the form lacks, or the form as a whole, in a banner', async () => {
      await open();
      await fill();
      refuse(422, {
        message: 'Validation failed',
        fieldErrors: { _: 'The request is not acceptable', floor: 'Unknown floor' },
      });

      await userEvent.click(save());

      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent('The request is not acceptable');
      expect(banner).toHaveTextContent('Unknown floor');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('when the request fails otherwise', () => {
    it('says so in a banner when the server cannot be reached, and lets Save be used again', async () => {
      const { opener } = await open();
      await fill();
      server.use(http.post(apiUrl('/bookings'), () => HttpResponse.error(), { once: true }));

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
      await vi.waitFor(() => {
        expect(field.room()).toHaveFocus();
      });
      expect(save()).toBeEnabled();
      await userEvent.click(save());
      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
    });

    it('says what failed when a server error carries no message of its own', async () => {
      await open();
      await fill();
      server.use(
        http.post(
          apiUrl('/bookings'),
          () => new HttpResponse('<html>bad gateway</html>', { status: 502 }),
          {
            once: true,
          },
        ),
      );

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    });

    it('drops an old banner when the retry is refused with field errors', async () => {
      await open();
      await fill();
      refuse(409, { message: 'Another admin changed this' });
      await userEvent.click(save());
      await screen.findByRole('alert');

      refuse(422, { message: 'Validation failed', fieldErrors: { attendees: 'No room for that' } });
      await userEvent.click(save());

      await screen.findByText('No room for that');
      expect(screen.queryByText('Another admin changed this')).not.toBeInTheDocument();
    });
  });

  describe('while saving', () => {
    beforeEach(() => {
      server.use(
        http.post(apiUrl('/bookings'), async () => {
          await delay(150);
          const record = storedBooking();
          return HttpResponse.json({ ...viewOf(record), id: 'bk_new' }, { status: 201 });
        }),
      );
    });

    it('shows that it is busy, and neither saves again nor lets the dialog be cancelled', async () => {
      const { dialog } = await open();
      await fill();

      await userEvent.click(save());

      expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(dialog.querySelector('form')).toHaveAttribute('aria-busy', 'true');
      expect(field.room()).toBeDisabled();
      expect(field.date()).toBeDisabled();
      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(writes()).toEqual(['POST /bookings']);
    });

    it('does not close on Escape until the answer is in', async () => {
      const { opener } = await open();
      await fill();
      await userEvent.click(save());
      await screen.findByRole('button', { name: 'Saving…' });

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', keyCode: 27 });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
    });
  });

  describe('submitting', () => {
    it('saves on Enter in a field when the form is valid and changed', async () => {
      const { opener } = await open();
      await fill();

      await userEvent.type(field.attendees(), '{Enter}');

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
    });

    it('sends nothing when the form is submitted while nothing is changed', async () => {
      const { dialog } = await edit();
      const form = dialog.querySelector('form');
      if (!form) throw new Error('The dialog has no form');

      fireEvent.submit(form);
      await TestBed.inject(ApplicationRef).whenStable();

      expect(writes()).toEqual([]);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('leaves Enter on a button to the button', async () => {
      const { dialog } = await open();
      within(dialog).getByRole('button', { name: 'Cancel' }).focus();

      await userEvent.keyboard('{Enter}');

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(writes()).toEqual([]);
    });
  });

  describe('the clock of the room not yet known', () => {
    it('keeps Save off until the room’s location has arrived, and sends the times on its clock', async () => {
      const room = roomAt('loc_4');
      let release: () => void = () => undefined;
      server.use(
        http.get(apiUrl(`/locations/${room.locationId}`), async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return HttpResponse.json({ ...locationOf(room), roomCount: 1 });
        }),
      );
      await open();
      await fill({ room });
      await vi.waitFor(() => {
        expect(requests).toContain(`GET /locations/${room.locationId}`);
      });

      expect(save()).toBeDisabled();
      release();

      await vi.waitFor(() => {
        expect(save()).toBeEnabled();
      });
    });

    it('says so under the date, and keeps Save off, when the location cannot be loaded', async () => {
      server.use(
        http.get(apiUrl('/locations/:id'), () =>
          HttpResponse.json({ message: 'Boom' }, { status: 500 }),
        ),
      );
      await open();
      await fill();

      expect(
        await screen.findByText(
          'The location of this room could not be loaded. Close the form and try again.',
        ),
      ).toBeInTheDocument();
      expect(save()).toBeDisabled();
    });
  });

  describe('an existing booking', () => {
    it('is titled "Edit booking" and starts from the booking, as its location’s clock reads it', async () => {
      const record = storedBooking();
      const booking = viewOf(record);
      const room = api.db.rooms.find((r) => r.id === record.roomId);
      const member = api.db.members.find((m) => m.id === record.memberId);
      if (!room || !member) throw new Error('seed is inconsistent');
      const zone = zoneOf(record) ?? 'UTC';
      const start = utcToZoned(record.startsAt, zone);
      const end = utcToZoned(record.endsAt, zone);

      const { dialog } = await edit(record);

      expect(dialog).toHaveAccessibleName('Edit booking');
      await vi.waitFor(() => {
        expect(field.room()).toHaveValue(roomLabel({ ...room, locationId: booking.locationId }));
      });
      expect(field.member()).toHaveValue(memberLabel(member));
      expect(field.date()).toHaveValue((start?.date ?? '').split('-').reverse().join('/'));
      expect(field.from()).toHaveValue(start?.time);
      expect(field.to()).toHaveValue(end?.time);
      expect(field.attendees()).toHaveValue(record.attendees);
      expect(field.notes()).toHaveValue(record.notes ?? '');
    });

    it('opens with focus in the first field, the room', async () => {
      await edit();

      await vi.waitFor(() => {
        expect(field.room()).toHaveFocus();
      });
    });

    it('cannot be saved while nothing is changed, and can once something is', async () => {
      await edit();
      expect(save()).toBeDisabled();

      await userEvent.type(field.notes(), 'x');

      expect(save()).toBeEnabled();
    });

    it('cannot be saved again once a change is taken back', async () => {
      await edit();

      await userEvent.type(field.notes(), 'x');
      expect(save()).toBeEnabled();
      await userEvent.type(field.notes(), '{Backspace}');

      expect(save()).toBeDisabled();
    });

    it('shows the times of a booking in a zone that is not UTC on that zone’s clock, across a clock change', async () => {
      const record = storedBooking();
      const room = roomAt('loc_4');
      record.roomId = room.id;
      record.startsAt = '2026-10-25T08:00:00.000Z';
      record.endsAt = '2026-10-25T09:30:00.000Z';

      await edit(record);

      // Berlin is on winter time (UTC+1) after 01:00 UTC that day.
      expect(field.date()).toHaveValue('25/10/2026');
      expect(field.from()).toHaveValue('09:00');
      expect(field.to()).toHaveValue('10:30');
    });

    it('saves the whole booking, says so, closes and hands the saved booking on', async () => {
      const record = storedBooking();
      const { opener } = await edit(record);

      await replace(field.notes(), 'Moved to the east wing');
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(opener.results[0]).toMatchObject({ id: record.id, notes: 'Moved to the east wing' });
      expect(api.db.bookings.find((b) => b.id === record.id)).toMatchObject({
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        notes: 'Moved to the east wing',
      });
      expect(writes()).toEqual([`PATCH /bookings/${record.id}`]);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent(/^Booking updated: /);
    });

    it('moves the booking to another time on the same clock', async () => {
      const record = storedBooking();
      const original = { startsAt: record.startsAt, endsAt: record.endsAt };
      const { opener } = await edit(record);
      const zone = zoneOf(record) ?? 'UTC';
      const start = utcToZoned(record.startsAt, zone);

      await replace(field.from(), '15:00');
      await replace(field.to(), '16:00');
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(api.db.bookings.find((b) => b.id === record.id)?.startsAt).toBe(
        zonedToUtcIso(start?.date ?? '', '15:00', zone),
      );
      expect(record.startsAt).not.toBe(original.startsAt);
    });

    it('shows a room that can no longer be booked, as the booking’s own', async () => {
      const record = storedBooking();
      const room = api.db.rooms.find((r) => r.id === record.roomId);
      if (!room) throw new Error('no room');
      room.status = 'maintenance';

      await edit(record);

      await vi.waitFor(() => {
        expect(field.room()).toHaveValue(roomLabel(room));
      });
    });

    it('shows a member who is no longer active as the booking’s own', async () => {
      const record = storedBooking();
      const member = api.db.members.find((m) => m.id === record.memberId);
      if (!member) throw new Error('no member');
      member.status = 'suspended';

      await edit(record);

      await vi.waitFor(() => {
        expect(field.member()).toHaveValue(memberLabel(member));
      });
    });

    it('shows the booking’s room and member names while their details are on their way', async () => {
      const record = storedBooking();
      server.use(
        http.get(apiUrl('/rooms/:id'), async () => {
          await delay(300);
          return HttpResponse.json({ message: 'Slow' }, { status: 500 });
        }),
      );

      await edit(record);

      expect(field.room()).toHaveValue(viewOf(record).roomName);
      expect(field.member()).toHaveValue(viewOf(record).memberName);
    });

    it('asks for a room again when the booking’s room has been deleted', async () => {
      const record = storedBooking();
      const booking = viewOf(record);
      const view = { ...booking, roomName: '—', locationId: '', locationName: '—' };
      api.db.rooms = api.db.rooms.filter((r) => r.id !== record.roomId);

      await open({ booking: view });

      expect(field.room()).toHaveValue('');
      expect(save()).toBeDisabled();
      await chooseRoom(roomAt('loc_4'));
      await vi.waitFor(() => {
        expect(save()).toBeEnabled();
      });
    });

    it('asks for a member again when the booking’s member has been deleted', async () => {
      const record = storedBooking();
      const booking = { ...viewOf(record), memberName: '—' };
      api.db.members = api.db.members.filter((m) => m.id !== record.memberId);

      await open({ booking, timeZone: locationOf(booking)?.timezone });

      expect(field.member()).toHaveValue('');
      expect(save()).toBeDisabled();
      await chooseMember(activeMember());
      expect(save()).toBeEnabled();
    });

    it('reads the times on the clock of another room’s location once that room is chosen', async () => {
      const record = storedBooking();
      const kyiv = roomAt('loc_1');
      const berlin = roomAt('loc_4');
      record.roomId = kyiv.id;
      record.startsAt = '2027-03-02T08:00:00.000Z';
      record.endsAt = '2027-03-02T09:00:00.000Z';
      const { opener } = await edit(record);
      expect(field.from()).toHaveValue('10:00');

      await chooseRoom(berlin);
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      // 10:00 on the clock of Berlin, not of Kyiv.
      expect(api.db.bookings.find((b) => b.id === record.id)?.startsAt).toBe(
        '2027-03-02T09:00:00.000Z',
      );
    });

    it('is refused with a banner when the booking can no longer be edited (409)', async () => {
      const record = storedBooking();
      await edit(record);
      record.status = 'completed';
      await userEvent.type(field.notes(), 'x');

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Only pending or confirmed bookings can be edited',
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('says so when the booking was deleted meanwhile (404)', async () => {
      const record = storedBooking();
      await edit(record);
      api.db.bookings = api.db.bookings.filter((b) => b.id !== record.id);
      await userEvent.type(field.notes(), 'x');

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Booking not found');
    });

    it('does not clash with itself: the booking’s own slot can be saved again', async () => {
      const record = storedBooking('confirmed');
      const { opener } = await edit(record);

      await userEvent.type(field.notes(), ' again');
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(opener.results[0]).toMatchObject({ id: record.id, status: 'confirmed' });
    });
  });
});
