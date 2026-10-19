import { OverlayContainer } from '@angular/cdk/overlay';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createQuery } from '@core/api/create-query';
import { listTag } from '@core/api/tags';
import type { RoomInput } from '@shared/api/contract';
import { installMockApi, signIn, TEST_NOW } from '@testing/mock-api';
import { server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import { injectCreateRoom, injectDeleteRoom, injectUpdateRoom } from './room-mutations';
import { injectRoomQuery, injectRoomsQuery } from './room-queries';

const INPUT: RoomInput = {
  locationId: 'loc_1',
  name: 'Harbour Room',
  type: 'meeting_room',
  capacity: 8,
  hourlyRate: 3250,
  amenities: ['projector', 'whiteboard'],
  status: 'available',
};

describe('room mutations', () => {
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
  const first = () => api.db.rooms[0];
  const countOf = (request: string) => requests.filter((r) => r === request).length;
  const queryOf = (url: string, tag: 'Location' | 'Booking' | 'Member') =>
    createQuery({
      request: () => ({ url, params: { limit: 1 } }),
      tags: () => [listTag(tag)],
      injector: TestBed.inject(Injector),
    });

  /** Queries on screen that show a room, a list, and what embeds one: locations and bookings. */
  async function mountQueries() {
    const list = inject(() =>
      injectRoomsQuery(() => ({ page: 1, limit: 100, q: '', locationId: INPUT.locationId })),
    );
    const detail = inject(() => injectRoomQuery(() => first().id));
    const locations = queryOf('/locations', 'Location');
    const bookings = queryOf('/bookings', 'Booking');
    const members = queryOf('/members', 'Member');
    await eventually(() => {
      expect(
        list.value() && detail.value() && locations.value() && bookings.value() && members.value(),
      ).toBeTruthy();
    });
    requests.length = 0;
    return { list, detail, bookings, members };
  }

  describe('injectCreateRoom', () => {
    it('posts the input and resolves with the created room', async () => {
      const create = inject(injectCreateRoom);

      const created = await create.run(INPUT);

      expect(created).toMatchObject({ ...INPUT, locationName: 'Riverside Hub' });
      expect(api.db.rooms.some((r) => r.id === created.id)).toBe(true);
      expect(requests).toEqual(['POST /rooms']);
    });

    it('reloads the lists, and what embeds a room, but not other details or members', async () => {
      const { list, detail, bookings, members } = await mountQueries();
      const create = inject(injectCreateRoom);

      const created = await create.run(INPUT);

      await eventually(() => {
        expect(list.value()?.items.map((r) => r.id)).toContain(created.id);
      });
      expect(countOf('GET /rooms')).toBe(1);
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf('GET /members')).toBe(0);
      expect(countOf(`GET /rooms/${first().id}`)).toBe(0);
      expect(detail.value()?.id).toBe(first().id);
      expect(bookings.value()).toBeDefined();
      expect(members.value()).toBeDefined();
    });

    it('reloads the locations, whose room count has changed', async () => {
      await mountQueries();
      const create = inject(injectCreateRoom);

      await create.run(INPUT);

      await eventually(() => {
        expect(countOf('GET /locations')).toBe(1);
      });
    });

    it('leaves the refusal to the form: no snackbar, the rejection carries the field errors', async () => {
      const create = inject(injectCreateRoom);

      await expect(create.run({ ...INPUT, name: 'x' })).rejects.toMatchObject({ status: 422 });

      expect(create.error()?.fieldErrors).toEqual({ name: 'At least 2 characters' });
      expect(snackbars()).toHaveLength(0);
    });

    it('is refused with a field error for a location that does not exist', async () => {
      const create = inject(injectCreateRoom);

      await expect(create.run({ ...INPUT, locationId: 'loc_nope' })).rejects.toMatchObject({
        status: 422,
      });

      expect(create.error()?.fieldErrors).toEqual({ locationId: 'Location not found' });
    });

    it('invalidates nothing when it fails', async () => {
      const { list } = await mountQueries();
      const create = inject(injectCreateRoom);

      await expect(create.run({ ...INPUT, name: 'x' })).rejects.toBeDefined();
      await new Promise((resolve) => setTimeout(resolve, 20));
      TestBed.tick();

      expect(requests).toEqual(['POST /rooms']);
      expect(list.value()).toBeDefined();
    });
  });

  describe('injectUpdateRoom', () => {
    it('patches that room with the whole input', async () => {
      const update = inject(injectUpdateRoom);

      const saved = await update.run({ id: first().id, input: INPUT });

      expect(saved).toMatchObject({ id: first().id, name: 'Harbour Room', hourlyRate: 3250 });
      expect(first().capacity).toBe(8);
      expect(requests).toEqual([`PATCH /rooms/${first().id}`]);
    });

    it('reloads its own detail, the lists and what embeds a room', async () => {
      const { detail, list, bookings, members } = await mountQueries();
      const update = inject(injectUpdateRoom);

      await update.run({ id: first().id, input: INPUT });

      await eventually(() => {
        expect(detail.value()?.name).toBe('Harbour Room');
      });
      expect(countOf(`GET /rooms/${first().id}`)).toBe(1);
      expect(countOf('GET /rooms')).toBe(1);
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf('GET /locations')).toBe(1);
      expect(countOf('GET /members')).toBe(0);
      expect(list.value()?.items.find((r) => r.id === first().id)?.name).toBe('Harbour Room');
      expect(bookings.value()).toBeDefined();
      expect(members.value()).toBeDefined();
    });

    it('does not reload the detail of another room', async () => {
      await mountQueries();
      const other = inject(() => injectRoomQuery(() => api.db.rooms[1].id));
      await eventually(() => {
        expect(other.value()).toBeDefined();
      });
      requests.length = 0;
      const update = inject(injectUpdateRoom);

      await update.run({ id: first().id, input: INPUT });
      await eventually(() => {
        expect(countOf(`GET /rooms/${first().id}`)).toBe(1);
      });

      expect(countOf(`GET /rooms/${api.db.rooms[1].id}`)).toBe(0);
    });

    it('is silent too, and a missing room comes back as a 404 for the form', async () => {
      const update = inject(injectUpdateRoom);

      await expect(update.run({ id: 'room_nope', input: INPUT })).rejects.toMatchObject({
        status: 404,
      });

      expect(snackbars()).toHaveLength(0);
    });
  });

  describe('injectDeleteRoom', () => {
    async function createFreeRoom() {
      return inject(injectCreateRoom).run(INPUT);
    }

    it('deletes the room', async () => {
      const { id } = await createFreeRoom();
      requests.length = 0;
      const remove = inject(injectDeleteRoom);

      await remove.run(id);

      expect(api.db.rooms.some((r) => r.id === id)).toBe(false);
      expect(requests).toEqual([`DELETE /rooms/${id}`]);
    });

    it('reloads the lists and what embeds a room, but not the deleted detail', async () => {
      const { id } = await createFreeRoom();
      const list = inject(() =>
        injectRoomsQuery(() => ({ page: 1, limit: 100, q: '', locationId: INPUT.locationId })),
      );
      const detail = inject(() => injectRoomQuery(() => id));
      const bookings = queryOf('/bookings', 'Booking');
      await eventually(() => {
        expect(list.value() && detail.value() && bookings.value()).toBeTruthy();
      });
      expect(list.value()?.items.map((r) => r.id)).toContain(id);
      requests.length = 0;
      const remove = inject(injectDeleteRoom);

      await remove.run(id);

      await eventually(() => {
        expect(list.value()?.items.map((r) => r.id)).not.toContain(id);
      });
      expect(countOf('GET /rooms')).toBe(1);
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf(`GET /rooms/${id}`)).toBe(0);
      expect(detail.error()).toBeUndefined();
    });

    it('is not silent: a room with upcoming bookings is refused with a snackbar carrying the reason', async () => {
      const booked = api.db.bookings.find(
        (b) => b.status === 'confirmed' && Date.parse(b.endsAt) > TEST_NOW,
      );
      if (!booked) throw new Error('seed has no upcoming booking');
      const remove = inject(injectDeleteRoom);

      await expect(remove.run(booked.roomId)).rejects.toMatchObject({ status: 409 });

      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent(
        'This room has upcoming bookings; cancel them first',
      );
      expect(remove.error()?.status).toBe(409);
      expect(api.db.rooms.some((r) => r.id === booked.roomId)).toBe(true);
    });
  });
});
