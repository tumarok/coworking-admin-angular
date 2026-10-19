import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { installMockApi, signIn } from '@testing/mock-api';
import { provideTestApi } from '@testing/test-providers';
import { server } from '@testing/msw-server';
import { injectRoomById, injectRoomSearch } from './room-lookups';

describe('room lookups', () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    TestBed.configureTestingModule({ providers: provideTestApi() });
    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.includes('/rooms')) requests.push(`${url.pathname}${url.search}`);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  const eventually = (check: () => void) =>
    vi.waitFor(() => {
      TestBed.tick();
      check();
    });

  describe('injectRoomSearch', () => {
    const run = (search: ReturnType<typeof signal<string>>) =>
      TestBed.runInInjectionContext(() => injectRoomSearch(search));

    it('asks the server for the first 20 rooms a booking can be made in', async () => {
      const query = run(signal(''));

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      expect(requests).toEqual(['/api/v1/rooms?limit=20&page=1&status=available']);
      expect(query.value()?.items.every((r) => r.status === 'available')).toBe(true);
      expect(query.value()?.items.length).toBeLessThanOrEqual(20);
    });

    it('passes the search on, so the server finds the rooms by name or location', async () => {
      const room = api.db.rooms.find((r) => r.status === 'available');
      if (!room) throw new Error('seed has no available room');
      const query = run(signal(room.name));

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      expect(requests[0]).toContain(`q=${encodeURIComponent(room.name)}`);
      expect(query.value()?.items.map((r) => r.id)).toContain(room.id);
      expect(
        query.value()?.items.every((r) => r.name.toLowerCase().includes(room.name.toLowerCase())),
      ).toBe(true);
    });

    it('asks again, once, when the search changes, and reports how many rooms match in all', async () => {
      const search = signal('');
      const query = run(search);
      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      const all = query.value()?.total ?? 0;

      search.set('zzzz-no-such-room');

      await eventually(() => {
        expect(query.value()?.total).toBe(0);
      });
      expect(all).toBeGreaterThan(0);
      expect(requests).toHaveLength(2);
    });
  });

  describe('injectRoomById', () => {
    const run = (id: ReturnType<typeof signal<string | undefined>>) =>
      TestBed.runInInjectionContext(() => injectRoomById(id));

    it('asks for nothing without an id', async () => {
      const query = run(signal(undefined));

      TestBed.tick();
      await TestBed.inject(ApplicationRef).whenStable();

      expect(requests).toEqual([]);
      expect(query.value()).toBeUndefined();
    });

    it('loads the room with that id, whatever its status', async () => {
      const room = api.db.rooms.find((r) => r.status !== 'available');
      if (!room) throw new Error('seed has no unavailable room');
      const query = run(signal<string | undefined>(room.id));

      await eventually(() => {
        expect(query.value()?.id).toBe(room.id);
      });
      expect(requests).toEqual([`/api/v1/rooms/${room.id}`]);
    });

    it('fails with the 404 for a room that does not exist', async () => {
      const query = run(signal<string | undefined>('room_nope'));

      await eventually(() => {
        expect(query.error()?.status).toBe(404);
      });
    });
  });
});
