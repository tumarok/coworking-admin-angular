import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { injectRoomQuery, injectRoomsQuery, type RoomListParams } from './room-queries';

describe('room queries', () => {
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

  const first = () => api.db.rooms[0];
  const eventually = (check: () => void) =>
    vi.waitFor(() => {
      TestBed.tick();
      check();
    });

  describe('injectRoomsQuery', () => {
    const run = (params: ReturnType<typeof signal<RoomListParams>>) =>
      TestBed.runInInjectionContext(() => injectRoomsQuery(params));

    it('asks for the page, the size, the search and every filter the list state holds', async () => {
      const query = run(
        signal({
          page: 1,
          limit: 5,
          q: 'studio',
          locationId: 'loc_1',
          type: 'meeting_room',
          status: 'available',
        }),
      );

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      expect(requests).toEqual([
        '/api/v1/rooms?limit=5&locationId=loc_1&page=1&q=studio&status=available&type=meeting_room',
      ]);
    });

    it('leaves an empty search and unset filters out of the request', async () => {
      const query = run(signal({ page: 1, limit: 20, q: '' }));

      await eventually(() => {
        expect(query.value()?.items.length).toBeGreaterThan(0);
      });
      expect(requests).toEqual(['/api/v1/rooms?limit=20&page=1']);
    });

    it('loads only the rooms of the location asked for', async () => {
      const query = run(signal({ page: 1, limit: 100, q: '', locationId: 'loc_1' }));

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      const expected = api.db.rooms.filter((r) => r.locationId === 'loc_1').length;
      expect(query.value()?.total).toBe(expected);
      expect(query.value()?.items.every((r) => r.locationId === 'loc_1')).toBe(true);
    });

    it('loads again, once, when the list state changes', async () => {
      const params = signal<RoomListParams>({ page: 1, limit: 2, q: '' });
      const query = run(params);
      await eventually(() => {
        expect(query.value()?.page).toBe(1);
      });

      params.set({ page: 2, limit: 2, q: '' });

      await eventually(() => {
        expect(query.value()?.page).toBe(2);
      });
      expect(requests).toEqual(['/api/v1/rooms?limit=2&page=1', '/api/v1/rooms?limit=2&page=2']);
    });

    it('reports a failed load as its error', async () => {
      server.use(
        http.get(apiUrl('/rooms'), () => HttpResponse.json({ message: 'Boom' }, { status: 500 })),
      );
      const query = run(signal({ page: 1, limit: 20, q: '' }));

      await eventually(() => {
        expect(query.error()).toMatchObject({ status: 500, message: 'Boom' });
      });
      expect(query.value()).toBeUndefined();
    });
  });

  describe('injectRoomQuery', () => {
    const run = (id: ReturnType<typeof signal<string>>) =>
      TestBed.runInInjectionContext(() => injectRoomQuery(id));

    it('loads the room with that id', async () => {
      const query = run(signal(first().id));

      await eventually(() => {
        expect(query.value()?.id).toBe(first().id);
      });
      expect(requests).toEqual([`/api/v1/rooms/${first().id}`]);
    });

    it('loads another room when the id changes, without showing the previous one meanwhile', async () => {
      const id = signal(first().id);
      const query = run(id);
      await eventually(() => {
        expect(query.value()?.id).toBe(first().id);
      });

      id.set(api.db.rooms[1].id);
      TestBed.tick();
      expect(query.value()).toBeUndefined();

      await eventually(() => {
        expect(query.value()?.id).toBe(api.db.rooms[1].id);
      });
    });

    it('sends an id that is not a plain word as one path segment', async () => {
      const query = run(signal('a/b?c'));

      await eventually(() => {
        expect(query.error()?.status).toBe(404);
      });
      expect(requests).toEqual(['/api/v1/rooms/a%2Fb%3Fc']);
    });

    it('fails with the 404 for a room that does not exist', async () => {
      const query = run(signal('room_nope'));

      await eventually(() => {
        expect(query.error()?.status).toBe(404);
      });
      expect(query.error()?.message).toBe('Room not found');
    });
  });
});
