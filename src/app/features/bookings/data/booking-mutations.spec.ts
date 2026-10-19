import { OverlayContainer } from '@angular/cdk/overlay';
import { ApplicationRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createQuery } from '@core/api/create-query';
import { listTag } from '@core/api/tags';
import { bookableSlot, findBookedSlot, installMockApi, signIn } from '@testing/mock-api';
import { server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import { injectBookingQuery, injectBookingsQuery } from './booking-queries';
import {
  injectChangeBookingStatus,
  injectCreateBooking,
  injectUpdateBooking,
} from './booking-mutations';

describe('booking mutations', () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    TestBed.configureTestingModule({ providers: provideTestApi() });
    requests = [];
    server.events.on('request:start', ({ request }) => {
      requests.push(`${request.method} ${new URL(request.url).pathname.replace('/api/v1', '')}`);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  const inject = <T>(factory: () => T) => TestBed.runInInjectionContext(factory);
  const eventually = (check: () => void) =>
    vi.waitFor(() => {
      TestBed.tick();
      check();
    });
  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');
  const countOf = (request: string) => requests.filter((r) => r === request).length;
  const queryOf = (url: string, tag: 'Room' | 'Member' | 'Location' | 'Dashboard') =>
    createQuery({
      request: () => ({ url, params: { limit: 1 } }),
      tags: () => [listTag(tag)],
      injector: TestBed.inject(Injector),
    });
  const pendingBooking = () => {
    const booking = api.db.bookings.find((b) => b.status === 'pending');
    if (!booking) throw new Error('seed has no pending booking');
    return booking;
  };

  /** Queries on screen that show a booking, a list and the dashboard; others that must stay. */
  async function mountQueries(id = pendingBooking().id) {
    const list = inject(() => injectBookingsQuery(() => ({ page: 1, limit: 100, q: '' })));
    const detail = inject(() => injectBookingQuery(() => id));
    const other = inject(() =>
      injectBookingQuery(() => api.db.bookings.find((b) => b.id !== id)?.id ?? ''),
    );
    const dashboard = queryOf('/dashboard', 'Dashboard');
    const rooms = queryOf('/rooms', 'Room');
    const members = queryOf('/members', 'Member');
    await eventually(() => {
      expect(
        list.value() &&
          detail.value() &&
          other.value() &&
          dashboard.value() &&
          rooms.value() &&
          members.value(),
      ).toBeTruthy();
    });
    requests.length = 0;
    return { list, detail, other, dashboard, rooms, members };
  }

  describe('injectCreateBooking', () => {
    it('posts the input and resolves with the created booking, pending, with its names', async () => {
      const { input, room, member } = bookableSlot(api);
      const create = inject(injectCreateBooking);

      const created = await create.run(input);

      expect(created).toMatchObject({
        ...input,
        status: 'pending',
        roomName: room.name,
        memberName: `${member.firstName} ${member.lastName}`,
      });
      expect(api.db.bookings.some((b) => b.id === created.id)).toBe(true);
      expect(requests).toEqual(['POST /bookings']);
    });

    it('reloads the lists and the dashboard, but not a booking’s detail, rooms or members', async () => {
      const { list, detail, dashboard, rooms, members } = await mountQueries();
      const { input } = bookableSlot(api);
      const create = inject(injectCreateBooking);

      const created = await create.run(input);

      await eventually(() => {
        expect(list.value()?.items.map((b) => b.id)).toContain(created.id);
      });
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf('GET /dashboard')).toBe(1);
      expect(countOf(`GET /bookings/${pendingBooking().id}`)).toBe(0);
      expect(countOf('GET /rooms')).toBe(0);
      expect(countOf('GET /members')).toBe(0);
      expect(detail.value()).toBeDefined();
      expect(dashboard.value()).toBeDefined();
      expect(rooms.value()).toBeDefined();
      expect(members.value()).toBeDefined();
    });

    it('leaves the refusal to the form: a field error comes back as a 422, with no snackbar', async () => {
      const { input, room } = bookableSlot(api);
      const create = inject(injectCreateBooking);

      await expect(create.run({ ...input, attendees: room.capacity + 1 })).rejects.toMatchObject({
        status: 422,
      });

      expect(create.error()?.fieldErrors).toEqual({
        attendees: `This room seats up to ${room.capacity}`,
      });
      expect(snackbars()).toHaveLength(0);
    });

    it('leaves a clash with another booking to the form too: a 409 with the bookings in the way', async () => {
      const { existing, room, member } = findBookedSlot(api);
      const create = inject(injectCreateBooking);

      await expect(
        create.run({
          roomId: room.id,
          memberId: member.id,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
          attendees: 1,
          notes: null,
        }),
      ).rejects.toMatchObject({ status: 409 });

      expect(create.error()?.message).toBe('The room is already booked for this time');
      expect(create.error()?.conflicts.map((c) => c.id)).toEqual([existing.id]);
      expect(snackbars()).toHaveLength(0);
    });

    it('invalidates nothing when it fails', async () => {
      const { list } = await mountQueries();
      const { input, room } = bookableSlot(api);
      const create = inject(injectCreateBooking);

      await expect(create.run({ ...input, attendees: room.capacity + 1 })).rejects.toBeDefined();
      TestBed.tick();
      await TestBed.inject(ApplicationRef).whenStable();

      expect(requests).toEqual(['POST /bookings']);
      expect(list.value()).toBeDefined();
    });
  });

  describe('injectUpdateBooking', () => {
    const slotFor = (id: string) => {
      const booking = api.db.bookings.find((b) => b.id === id);
      if (!booking) throw new Error('no such booking');
      return { ...bookableSlot(api, { date: '2027-03-03' }).input, roomId: booking.roomId };
    };

    it('patches that booking with the whole input, and prices it again', async () => {
      const id = pendingBooking().id;
      const { input, room } = bookableSlot(api, {
        date: '2027-03-03',
        start: '10:00',
        end: '12:00',
      });
      const update = inject(injectUpdateBooking);

      const saved = await update.run({ id, input });

      expect(saved).toMatchObject({ id, ...input, status: 'pending' });
      expect(saved.totalPrice).toBe(room.hourlyRate * 2);
      expect(requests).toEqual([`PATCH /bookings/${id}`]);
    });

    it('reloads its own detail, the lists and the dashboard, but not another booking', async () => {
      const id = pendingBooking().id;
      const { detail, list, other, dashboard, rooms, members } = await mountQueries(id);
      const { input } = bookableSlot(api, { date: '2027-03-03' });
      const update = inject(injectUpdateBooking);

      await update.run({ id, input });

      await eventually(() => {
        expect(detail.value()?.startsAt).toBe(input.startsAt);
      });
      expect(countOf(`GET /bookings/${id}`)).toBe(1);
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf('GET /dashboard')).toBe(1);
      expect(countOf(`GET /bookings/${other.value()?.id}`)).toBe(0);
      expect(countOf('GET /rooms')).toBe(0);
      expect(countOf('GET /members')).toBe(0);
      expect(list.value()).toBeDefined();
      expect(dashboard.value()).toBeDefined();
      expect(rooms.value()).toBeDefined();
      expect(members.value()).toBeDefined();
    });

    it('is silent too: a booking that is no longer editable comes back as a 409 for the form', async () => {
      const done = api.db.bookings.find((b) => b.status === 'completed');
      if (!done) throw new Error('seed has no completed booking');
      const update = inject(injectUpdateBooking);

      await expect(update.run({ id: done.id, input: slotFor(done.id) })).rejects.toMatchObject({
        status: 409,
      });

      expect(update.error()?.message).toBe('Only pending or confirmed bookings can be edited');
      expect(snackbars()).toHaveLength(0);
    });

    it('is silent when the booking was deleted meanwhile: a 404', async () => {
      const update = inject(injectUpdateBooking);

      await expect(
        update.run({ id: 'bk_nope', input: bookableSlot(api).input }),
      ).rejects.toMatchObject({ status: 404 });

      expect(snackbars()).toHaveLength(0);
    });
  });

  describe('injectChangeBookingStatus', () => {
    it('posts the status and resolves with the booking in it', async () => {
      const id = pendingBooking().id;
      const change = inject(injectChangeBookingStatus);

      const changed = await change.run({ id, status: 'confirmed' });

      expect(changed).toMatchObject({ id, status: 'confirmed' });
      expect(api.db.bookings.find((b) => b.id === id)?.status).toBe('confirmed');
      expect(requests).toEqual([`POST /bookings/${id}/status`]);
    });

    it('reloads the booking, the lists and the dashboard, but not another booking', async () => {
      const id = pendingBooking().id;
      const { detail, list, other, dashboard } = await mountQueries(id);
      const change = inject(injectChangeBookingStatus);

      await change.run({ id, status: 'cancelled' });

      await eventually(() => {
        expect(detail.value()?.status).toBe('cancelled');
      });
      expect(countOf(`GET /bookings/${id}`)).toBe(1);
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf('GET /dashboard')).toBe(1);
      expect(countOf(`GET /bookings/${other.value()?.id}`)).toBe(0);
      expect(list.value()).toBeDefined();
      expect(dashboard.value()).toBeDefined();
    });

    it('is not silent: a move the booking cannot make is refused with a snackbar carrying the reason', async () => {
      const id = pendingBooking().id;
      const change = inject(injectChangeBookingStatus);

      await expect(change.run({ id, status: 'completed' })).rejects.toMatchObject({ status: 409 });

      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Cannot change status from pending to completed');
      expect(change.error()?.status).toBe(409);
      expect(api.db.bookings.find((b) => b.id === id)?.status).toBe('pending');
    });

    it('invalidates nothing when it is refused', async () => {
      const id = pendingBooking().id;
      await mountQueries(id);
      const change = inject(injectChangeBookingStatus);

      await expect(change.run({ id, status: 'completed' })).rejects.toBeDefined();
      TestBed.tick();
      await TestBed.inject(ApplicationRef).whenStable();

      expect(requests).toEqual([`POST /bookings/${id}/status`]);
    });

    it('says a booking that does not exist is not found, with a snackbar', async () => {
      const change = inject(injectChangeBookingStatus);

      await expect(change.run({ id: 'bk_nope', status: 'confirmed' })).rejects.toMatchObject({
        status: 404,
      });

      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
    });
  });
});
