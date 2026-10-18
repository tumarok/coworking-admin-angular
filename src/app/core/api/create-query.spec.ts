import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Notifier } from '@core/notifications/notifier';
import { z } from 'zod';
import type { MockInstance } from 'vitest';
import { CACHE_TTL_MS } from './cache-store';
import { createQuery, type QueryOptions } from './create-query';
import { parseResponse } from './parse-response';
import { provideApi } from './provide-api';
import { TagRegistry } from './tag-registry';
import { idTag, listTag } from './tags';

interface Room {
  id: string;
  name: string;
}

const ROOMS = '/api/v1/rooms';

describe('createQuery', () => {
  let controller: HttpTestingController;
  let registry: TagRegistry;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    TestBed.configureTestingModule({
      providers: [
        provideApi(),
        provideHttpClientTesting(),
        { provide: Notifier, useValue: { error: vi.fn() } },
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    registry = TestBed.inject(TagRegistry);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A query in the test injector; most tests do not care about tags, so they default to none. */
  const query = <T = Room[]>(
    options: Omit<QueryOptions<T>, 'tags' | 'injector'> & { tags?: QueryOptions<T>['tags'] },
  ) => createQuery<T>({ tags: () => [], ...options, injector: TestBed.inject(Injector) });

  /** Lets the query send its request. */
  const start = () => {
    TestBed.tick();
  };

  /** Answers the request that is on its way and waits until the query has taken the answer. */
  async function answer(url: string, body: object, status = 200) {
    start();
    controller.expectOne(url).flush(body, { status, statusText: 'Status' });
    await TestBed.inject(ApplicationRef).whenStable();
  }

  const noRequests = () => {
    start();
    controller.expectNone(() => true);
  };

  it('has nothing to show and is loading until the answer arrives', async () => {
    const rooms = query({ request: () => ({ url: '/rooms' }) });
    start();

    expect(rooms.value()).toBeUndefined();
    expect(rooms.isLoading()).toBe(true);
    expect(rooms.isFetching()).toBe(true);

    await answer(ROOMS, [{ id: 'room_1', name: 'Atlas' }]);

    expect(rooms.value()).toEqual([{ id: 'room_1', name: 'Atlas' }]);
    expect(rooms.isLoading()).toBe(false);
    expect(rooms.isFetching()).toBe(false);
    expect(rooms.error()).toBeUndefined();
  });

  it('sends the serialized params and no empty ones', async () => {
    const rooms = query({
      request: () => ({
        url: '/rooms',
        params: { q: '', page: 2, status: undefined, type: 'hot_desk' },
      }),
    });

    await answer(`${ROOMS}?page=2&type=hot_desk`, []);

    expect(rooms.value()).toEqual([]);
  });

  it('runs the response through the parse function', async () => {
    const names = query<string[]>({
      request: () => ({ url: '/rooms' }),
      parse: (raw) => (raw as Room[]).map((room) => room.name),
    });

    await answer(ROOMS, [{ id: 'room_1', name: 'Atlas' }]);

    expect(names.value()).toEqual(['Atlas']);
  });

  it('sends nothing while the request is skipped, then follows the signal', async () => {
    const id = signal<string | undefined>(undefined);
    const room = query<Room>({
      request: () => (id() ? { url: `/rooms/${id()}` } : undefined),
    });

    noRequests();
    expect(room.value()).toBeUndefined();
    expect(room.isLoading()).toBe(false);

    id.set('room_1');
    await answer(`${ROOMS}/room_1`, { id: 'room_1', name: 'Atlas' });

    expect(room.value()).toEqual({ id: 'room_1', name: 'Atlas' });

    id.set(undefined);
    TestBed.tick();
    expect(room.value()).toBeUndefined();
  });

  it('shows nothing of the previous record while another record loads', async () => {
    const id = signal('room_1');
    const room = query<Room>({ request: () => ({ url: `/rooms/${id()}` }) });
    await answer(`${ROOMS}/room_1`, { id: 'room_1', name: 'Atlas' });

    id.set('room_2');
    start();

    expect(room.value()).toBeUndefined();
    expect(room.isLoading()).toBe(true);

    await answer(`${ROOMS}/room_2`, { id: 'room_2', name: 'Birch' });
    expect(room.value()).toEqual({ id: 'room_2', name: 'Birch' });
  });

  it('shows neither the previous record nor a stale one when the next record is missing', async () => {
    const id = signal('room_1');
    const room = query<Room>({ request: () => ({ url: `/rooms/${id()}` }) });
    await answer(`${ROOMS}/room_1`, { id: 'room_1', name: 'Atlas' });

    id.set('room_2');
    await answer(`${ROOMS}/room_2`, { message: 'Room not found' }, 404);

    expect(room.value()).toBeUndefined();
    expect(room.error()?.status).toBe(404);
  });

  it('keeps the previous result on screen while the next page loads', async () => {
    const page = signal(1);
    const rooms = query({ request: () => ({ url: '/rooms', params: { page: page() } }) });
    await answer(`${ROOMS}?page=1`, [{ id: 'room_1', name: 'Atlas' }]);

    page.set(2);
    start();

    expect(rooms.value()).toEqual([{ id: 'room_1', name: 'Atlas' }]);
    expect(rooms.isFetching()).toBe(true);
    expect(rooms.isLoading()).toBe(false);

    await answer(`${ROOMS}?page=2`, [{ id: 'room_2', name: 'Birch' }]);

    expect(rooms.value()).toEqual([{ id: 'room_2', name: 'Birch' }]);
  });

  it('does not send the request again for equal params in a new object', async () => {
    const nudge = signal(0);
    query({
      request: () => {
        void nudge();
        return { url: '/rooms', params: { page: 1 } };
      },
    });
    await answer(`${ROOMS}?page=1`, []);

    nudge.set(1);

    noRequests();
  });

  it('answers from the cache when it returns to params it has already loaded', async () => {
    const page = signal(1);
    const rooms = query({ request: () => ({ url: '/rooms', params: { page: page() } }) });
    await answer(`${ROOMS}?page=1`, [{ id: 'room_1', name: 'Atlas' }]);
    page.set(2);
    await answer(`${ROOMS}?page=2`, [{ id: 'room_2', name: 'Birch' }]);

    page.set(1);
    start();
    await TestBed.inject(ApplicationRef).whenStable();

    controller.expectNone(() => true);
    expect(rooms.value()).toEqual([{ id: 'room_1', name: 'Atlas' }]);
  });

  it('answers a second query for the same URL from the cache, until the TTL runs out', async () => {
    query({ request: () => ({ url: '/rooms' }) });
    await answer(ROOMS, []);

    const second = query({ request: () => ({ url: '/rooms' }) });
    start();
    await TestBed.inject(ApplicationRef).whenStable();
    controller.expectNone(() => true);
    expect(second.value()).toEqual([]);

    vi.advanceTimersByTime(CACHE_TTL_MS);
    query({ request: () => ({ url: '/rooms' }) });
    await answer(ROOMS, []);
  });

  describe('invalidation', () => {
    it('reloads when a tag it shows is invalidated', async () => {
      const rooms = query({
        request: () => ({ url: '/rooms' }),
        tags: () => [listTag('Room')],
      });
      await answer(ROOMS, [{ id: 'room_1', name: 'Atlas' }]);

      registry.invalidate([listTag('Room')]);
      start();

      expect(rooms.isFetching()).toBe(true);
      expect(rooms.value()).toEqual([{ id: 'room_1', name: 'Atlas' }]);
      await answer(ROOMS, [{ id: 'room_1', name: 'Atlas 2' }]);
      expect(rooms.value()).toEqual([{ id: 'room_1', name: 'Atlas 2' }]);
    });

    it('reloads once when several of its tags are invalidated together', async () => {
      query({
        request: () => ({ url: '/rooms/room_1' }),
        tags: () => [idTag('Room', 'room_1'), listTag('Room')],
      });
      await answer(`${ROOMS}/room_1`, {});

      registry.invalidate([idTag('Room', 'room_1'), listTag('Room'), idTag('Room', 'room_1')]);
      start();

      controller.expectOne(`${ROOMS}/room_1`);
      controller.expectNone(() => true);
    });

    it('does not reload for tags it does not show', async () => {
      query({ request: () => ({ url: '/rooms' }), tags: () => [listTag('Room')] });
      await answer(ROOMS, []);

      registry.invalidate([listTag('Member'), idTag('Room', 'room_1')]);

      noRequests();
    });

    it('reloads when the whole type is invalidated', async () => {
      query({
        request: () => ({ url: '/bookings/bk_1' }),
        tags: () => [idTag('Booking', 'bk_1')],
      });
      await answer('/api/v1/bookings/bk_1', {});

      registry.invalidate([{ type: 'Booking', id: '*' }]);

      await answer('/api/v1/bookings/bk_1', {});
    });

    it('reloads with the tags of its current inputs only', async () => {
      const id = signal('room_1');
      query({
        request: () => ({ url: `/rooms/${id()}` }),
        tags: () => [idTag('Room', id())],
      });
      await answer(`${ROOMS}/room_1`, {});
      id.set('room_2');
      await answer(`${ROOMS}/room_2`, {});

      registry.invalidate([idTag('Room', 'room_1')]);
      noRequests();

      registry.invalidate([idTag('Room', 'room_2')]);
      await answer(`${ROOMS}/room_2`, {});
    });

    it('is loaded fresh by the next visit after its tag changed while it was away', async () => {
      query({ request: () => ({ url: '/rooms' }), tags: () => [listTag('Room')] });
      await answer(ROOMS, []);

      registry.invalidate([listTag('Room')]);

      query({ request: () => ({ url: '/rooms' }), tags: () => [listTag('Room')] });
      await answer(ROOMS, []);
    });
  });

  describe('refresh', () => {
    it('asks the server even though the answer is cached', async () => {
      const rooms = query({ request: () => ({ url: '/rooms' }) });
      await answer(ROOMS, [{ id: 'room_1', name: 'Atlas' }]);

      rooms.refresh();
      await answer(ROOMS, [{ id: 'room_1', name: 'Renamed' }]);

      expect(rooms.value()).toEqual([{ id: 'room_1', name: 'Renamed' }]);
    });

    it('bypasses the cache once only', async () => {
      const page = signal(1);
      const rooms = query({ request: () => ({ url: '/rooms', params: { page: page() } }) });
      await answer(`${ROOMS}?page=1`, []);
      page.set(2);
      await answer(`${ROOMS}?page=2`, []);

      rooms.refresh();
      await answer(`${ROOMS}?page=2`, []);

      page.set(1);
      noRequests();
    });
  });

  describe('failure', () => {
    it('exposes the parsed error and keeps the last result', async () => {
      const page = signal(1);
      const rooms = query({ request: () => ({ url: '/rooms', params: { page: page() } }) });
      await answer(`${ROOMS}?page=1`, [{ id: 'room_1', name: 'Atlas' }]);

      page.set(2);
      await answer(`${ROOMS}?page=2`, { message: 'Validation failed' }, 422);

      expect(rooms.error()).toMatchObject({ status: 422, message: 'Validation failed' });
      expect(rooms.value()).toEqual([{ id: 'room_1', name: 'Atlas' }]);
      expect(rooms.isFetching()).toBe(false);
    });

    it('tells a missing entity apart by its status', async () => {
      const room = query<Room>({ request: () => ({ url: '/rooms/nope' }) });

      await answer(`${ROOMS}/nope`, { message: 'Room not found' }, 404);

      expect(room.error()?.status).toBe(404);
      expect(room.value()).toBeUndefined();
    });

    it('clears the error when the next request starts', async () => {
      const rooms = query({ request: () => ({ url: '/rooms' }) });
      await answer(ROOMS, { message: 'Down' }, 500);
      expect(rooms.error()?.status).toBe(500);

      rooms.refresh();
      start();

      expect(rooms.error()).toBeUndefined();
      await answer(ROOMS, []);
      expect(rooms.value()).toEqual([]);
    });
  });

  describe('contract validation', () => {
    const roomSchema = z.object({ id: z.string(), name: z.string() });
    let logged: MockInstance<typeof console.error>;

    beforeEach(() => {
      logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      logged.mockRestore();
    });

    it('delivers a response that fits the schema', async () => {
      const room = query<Room>({
        request: () => ({ url: '/rooms/room_1' }),
        parse: parseResponse(roomSchema, 'GET /rooms/:id'),
      });

      await answer(`${ROOMS}/room_1`, { id: 'room_1', name: 'Atlas' });

      expect(room.value()).toEqual({ id: 'room_1', name: 'Atlas' });
      expect(logged).not.toHaveBeenCalled();
    });

    it('delivers a response that breaks it too, and logs the mismatch', async () => {
      const room = query<Room>({
        request: () => ({ url: '/rooms/room_1' }),
        parse: parseResponse(roomSchema, 'GET /rooms/:id'),
      });

      await answer(`${ROOMS}/room_1`, { id: 'room_1', name: 7 });

      expect(room.value()).toEqual({ id: 'room_1', name: 7 });
      expect(room.error()).toBeUndefined();
      expect(logged).toHaveBeenCalledWith('Contract mismatch in GET /rooms/:id', expect.any(Array));
    });
  });

  it('fails clearly when created outside an injection context without an injector', () => {
    expect(() => createQuery({ request: () => ({ url: '/rooms' }), tags: () => [] })).toThrow();
  });

  it('picks up the injection context of its caller', async () => {
    const rooms = TestBed.runInInjectionContext(() =>
      createQuery<Room[]>({ request: () => ({ url: '/rooms' }), tags: () => [] }),
    );

    await answer(ROOMS, []);

    expect(rooms.value()).toEqual([]);
  });
});
