import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { z } from 'zod';
import type { MockInstance } from 'vitest';
import { parseResponse } from './parse-response';
import { Notifier } from '@core/notifications/notifier';
import { SILENT } from '@core/http/silent';
import { createMutation, type MutationOptions } from './create-mutation';
import { createQuery } from './create-query';
import { provideApi } from './provide-api';
import { TagRegistry } from './tag-registry';
import { idTag, listTag, removedTags, savedTags, type Tag } from './tags';

interface Room {
  id: string;
  name: string;
}

describe('createMutation', () => {
  let controller: HttpTestingController;
  let registry: TagRegistry;
  let invalidated: Tag[][];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideApi(),
        provideHttpClientTesting(),
        { provide: Notifier, useValue: { error: vi.fn() } },
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    registry = TestBed.inject(TagRegistry);
    invalidated = [];
    vi.spyOn(registry, 'invalidate').mockImplementation((tags) => {
      invalidated.push([...tags]);
    });
  });

  const mutation = <A, R>(options: MutationOptions<A, R>) =>
    createMutation<A, R>({ ...options, injector: TestBed.inject(Injector) });

  const saveRoom = (options: Partial<MutationOptions<Room, Room>> = {}) =>
    mutation<Room, Room>({
      request: (room) => ({ method: 'PATCH', url: `/rooms/${room.id}`, body: room }),
      ...options,
    });

  it('sends the request and resolves with the response', async () => {
    const save = saveRoom();

    const result = save.run({ id: 'room_1', name: 'Atlas' });
    const req = controller.expectOne('/api/v1/rooms/room_1');
    req.flush({ id: 'room_1', name: 'Atlas 2' });

    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ id: 'room_1', name: 'Atlas' });
    await expect(result).resolves.toEqual({ id: 'room_1', name: 'Atlas 2' });
  });

  it('serializes the params like a query does', async () => {
    const remove = mutation<string, null>({
      request: (id) => ({
        method: 'DELETE',
        url: `/rooms/${id}`,
        params: { force: true, note: '' },
      }),
    });

    const result = remove.run('room_1');
    controller.expectOne('/api/v1/rooms/room_1?force=true').flush(null);

    await expect(result).resolves.toBeNull();
  });

  it('is pending from the call until the response', async () => {
    const save = saveRoom();
    expect(save.isPending()).toBe(false);

    const result = save.run({ id: 'room_1', name: 'Atlas' });
    expect(save.isPending()).toBe(true);

    controller.expectOne('/api/v1/rooms/room_1').flush({});
    await result;
    expect(save.isPending()).toBe(false);
  });

  it('stays pending until the last of overlapping runs ends', async () => {
    const save = saveRoom();
    const first = save.run({ id: 'room_1', name: 'A' });
    const second = save.run({ id: 'room_2', name: 'B' });

    controller.expectOne('/api/v1/rooms/room_1').flush({});
    await first;
    expect(save.isPending()).toBe(true);

    controller.expectOne('/api/v1/rooms/room_2').flush({});
    await second;
    expect(save.isPending()).toBe(false);
  });

  describe('parse', () => {
    let logged: MockInstance<typeof console.error>;

    beforeEach(() => {
      logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      logged.mockRestore();
    });

    const roomSchema = z.object({ id: z.string(), name: z.string() });

    it('returns the validated response', async () => {
      const save = saveRoom({ parse: parseResponse(roomSchema, 'PATCH /rooms/:id') });

      const result = save.run({ id: 'room_1', name: 'Atlas' });
      controller.expectOne('/api/v1/rooms/room_1').flush({ id: 'room_1', name: 'Atlas', extra: 1 });

      await expect(result).resolves.toEqual({ id: 'room_1', name: 'Atlas' });
      expect(logged).not.toHaveBeenCalled();
    });

    it('still returns a response that breaks the contract, and logs it', async () => {
      const save = saveRoom({ parse: parseResponse(roomSchema, 'PATCH /rooms/:id') });

      const result = save.run({ id: 'room_1', name: 'Atlas' });
      controller.expectOne('/api/v1/rooms/room_1').flush({ id: 'room_1', name: 7 });

      await expect(result).resolves.toEqual({ id: 'room_1', name: 7 });
      expect(logged).toHaveBeenCalledWith(
        'Contract mismatch in PATCH /rooms/:id',
        expect.any(Array),
      );
    });
  });

  describe('invalidation', () => {
    it('invalidates the tags built from the argument and the result after a success', async () => {
      const create = mutation<{ name: string }, Room>({
        request: (body) => ({ method: 'POST', url: '/rooms', body }),
        invalidates: (arg, room) => [idTag('Room', room.id), listTag('Room')],
      });

      const result = create.run({ name: 'Atlas' });
      expect(invalidated).toEqual([]);
      controller.expectOne('/api/v1/rooms').flush({ id: 'room_9', name: 'Atlas' });
      await result;

      expect(invalidated).toEqual([[idTag('Room', 'room_9'), listTag('Room')]]);
    });

    it('invalidates nothing when the mutation names no tags', async () => {
      const save = saveRoom();

      const result = save.run({ id: 'room_1', name: 'Atlas' });
      controller.expectOne('/api/v1/rooms/room_1').flush({});
      await result;

      expect(invalidated).toEqual([[]]);
    });

    it('does not report a successful write as failed when naming the tags throws', async () => {
      const save = saveRoom({
        invalidates: () => {
          throw new Error('bug');
        },
      });

      const result = save.run({ id: 'room_1', name: 'Atlas' });
      controller.expectOne('/api/v1/rooms/room_1').flush({});

      await expect(result).rejects.toThrow('bug');
      expect(save.error()).toBeUndefined();
      expect(save.isPending()).toBe(false);
    });

    it('invalidates nothing when the request fails', async () => {
      const save = saveRoom({ invalidates: () => [listTag('Room')] });

      const result = save.run({ id: 'room_1', name: 'Atlas' });
      controller
        .expectOne('/api/v1/rooms/room_1')
        .flush({ message: 'No' }, { status: 409, statusText: 'Conflict' });
      await result.catch(() => undefined);

      expect(invalidated).toEqual([]);
    });
  });

  describe('failure', () => {
    it('rejects with the response error and exposes it parsed', async () => {
      const save = saveRoom({
        request: (room) => ({ method: 'PATCH', url: `/rooms/${room.id}`, silent: true }),
      });

      const result = save.run({ id: 'room_1', name: '' });
      controller
        .expectOne('/api/v1/rooms/room_1')
        .flush(
          { message: 'Validation failed', fieldErrors: { name: 'At least 2 characters' } },
          { status: 422, statusText: 'Unprocessable' },
        );

      await expect(result).rejects.toBeInstanceOf(HttpErrorResponse);
      expect(save.error()).toMatchObject({
        status: 422,
        fieldErrors: { name: 'At least 2 characters' },
      });
      expect(save.isPending()).toBe(false);
    });

    it('clears the error when the next run starts', async () => {
      const save = saveRoom();
      const failed = save.run({ id: 'room_1', name: 'A' });
      controller
        .expectOne('/api/v1/rooms/room_1')
        .flush({ message: 'No' }, { status: 500, statusText: 'Error' });
      await failed.catch(() => undefined);
      expect(save.error()?.status).toBe(500);

      const retried = save.run({ id: 'room_1', name: 'A' });
      expect(save.error()).toBeUndefined();
      controller.expectOne('/api/v1/rooms/room_1').flush({});
      await retried;
    });

    it('reports a request that cannot be built as a failed run', async () => {
      const broken = mutation<undefined, undefined>({
        request: () => {
          throw new Error('boom');
        },
      });

      await expect(broken.run(undefined)).rejects.toThrow('boom');
      expect(broken.error()?.message).toBe('Something went wrong. Please try again.');
      expect(broken.isPending()).toBe(false);
    });
  });

  describe('silent', () => {
    it('marks the request when the caller reports the failure itself', async () => {
      const save = saveRoom({
        request: (room) => ({ method: 'PATCH', url: `/rooms/${room.id}`, silent: true }),
      });

      const result = save.run({ id: 'room_1', name: 'A' });
      const req = controller.expectOne('/api/v1/rooms/room_1');
      req.flush({});
      await result;

      expect(req.request.context.get(SILENT)).toBe(true);
    });

    it('lets the snackbar report the failure by default', async () => {
      const save = saveRoom();

      const result = save.run({ id: 'room_1', name: 'A' });
      const req = controller.expectOne('/api/v1/rooms/room_1');
      req.flush({});
      await result;

      expect(req.request.context.get(SILENT)).toBe(false);
    });
  });

  it('picks up the injection context of its caller', async () => {
    const remove = TestBed.runInInjectionContext(() =>
      createMutation<string, null>({
        request: (id) => ({ method: 'DELETE', url: `/rooms/${id}` }),
      }),
    );

    const result = remove.run('room_1');
    controller.expectOne('/api/v1/rooms/room_1').flush(null);

    await expect(result).resolves.toBeNull();
  });
});

describe('createMutation with active queries', () => {
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideApi(),
        provideHttpClientTesting(),
        { provide: Notifier, useValue: { error: vi.fn() } },
      ],
    });
    controller = TestBed.inject(HttpTestingController);
  });

  const injector = () => TestBed.inject(Injector);
  const settle = () => TestBed.inject(ApplicationRef).whenStable();

  /** Loads a query on screen and answers its first request. */
  async function show(url: string, tags: Tag[]) {
    const ref = createQuery<object>({
      request: () => ({ url }),
      tags: () => tags,
      injector: injector(),
    });
    TestBed.tick();
    controller.expectOne(`/api/v1${url}`).flush({});
    await settle();
    return ref;
  }

  const updateRoom = () =>
    createMutation<string, Room>({
      request: (id) => ({ method: 'PATCH', url: `/rooms/${id}`, body: {}, silent: true }),
      invalidates: (id) => savedTags('Room', id),
      injector: injector(),
    });

  it('reloads the queries that show the saved entity', async () => {
    await show('/rooms', [listTag('Room')]);
    await show('/rooms/room_1', [idTag('Room', 'room_1')]);
    await show('/rooms/room_2', [idTag('Room', 'room_2')]);

    const result = updateRoom().run('room_1');
    controller.expectOne('/api/v1/rooms/room_1').flush({});
    await result;
    TestBed.tick();

    controller.expectOne('/api/v1/rooms');
    controller.expectOne('/api/v1/rooms/room_1');
    controller.expectNone('/api/v1/rooms/room_2');
  });

  it('reloads the bookings that carry the changed room’s name, lists and details alike', async () => {
    await show('/bookings', [listTag('Booking')]);
    await show('/bookings/bk_1', [idTag('Booking', 'bk_1')]);
    await show('/dashboard', [listTag('Dashboard')]);
    await show('/members', [listTag('Member')]);

    const result = updateRoom().run('room_1');
    controller.expectOne('/api/v1/rooms/room_1').flush({});
    await result;
    TestBed.tick();

    controller.expectOne('/api/v1/bookings');
    controller.expectOne('/api/v1/bookings/bk_1');
    controller.expectOne('/api/v1/dashboard');
    controller.expectNone('/api/v1/members');
  });

  it('reloads a location’s rooms and bookings when the location is renamed', async () => {
    await show('/rooms', [listTag('Room')]);
    await show('/rooms/room_1', [idTag('Room', 'room_1')]);
    await show('/bookings', [listTag('Booking')]);
    await show('/members', [listTag('Member')]);

    const rename = createMutation<string, object>({
      request: (id) => ({ method: 'PATCH', url: `/locations/${id}`, body: {} }),
      invalidates: (id) => savedTags('Location', id),
      injector: injector(),
    });
    const result = rename.run('loc_1');
    controller.expectOne('/api/v1/locations/loc_1').flush({});
    await result;
    TestBed.tick();

    controller.expectOne('/api/v1/rooms');
    controller.expectOne('/api/v1/rooms/room_1');
    controller.expectOne('/api/v1/bookings');
    controller.expectNone('/api/v1/members');
  });

  it('reloads the list but not the page of the entity that was deleted', async () => {
    await show('/rooms', [listTag('Room')]);
    await show('/rooms/room_1', [idTag('Room', 'room_1')]);

    const remove = createMutation<string, null>({
      request: (id) => ({ method: 'DELETE', url: `/rooms/${id}` }),
      invalidates: () => removedTags('Room'),
      injector: injector(),
    });
    const result = remove.run('room_1');
    controller.expectOne('/api/v1/rooms/room_1').flush(null);
    await result;
    TestBed.tick();

    controller.expectOne('/api/v1/rooms');
    controller.expectNone('/api/v1/rooms/room_1');
  });

  it('reloads a query once however many of its tags the mutation names', async () => {
    const page = signal(1);
    createQuery<object>({
      request: () => ({ url: '/bookings', params: { page: page() } }),
      tags: () => [listTag('Booking')],
      injector: injector(),
    });
    TestBed.tick();
    controller.expectOne('/api/v1/bookings?page=1').flush({});
    await settle();

    const result = updateRoom().run('room_1');
    controller.expectOne('/api/v1/rooms/room_1').flush({});
    await result;
    TestBed.tick();

    controller.expectOne('/api/v1/bookings?page=1');
    controller.expectNone(() => true);
  });
});
