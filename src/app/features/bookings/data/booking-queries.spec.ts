import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { type BookingListParams, injectBookingQuery, injectBookingsQuery } from './booking-queries';

describe('booking queries', () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    TestBed.configureTestingModule({ providers: provideTestApi() });
    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.includes('/bookings')) requests.push(`${url.pathname}${url.search}`);
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

  describe('injectBookingsQuery', () => {
    const run = (params: ReturnType<typeof signal<BookingListParams>>) =>
      TestBed.runInInjectionContext(() => injectBookingsQuery(params));

    it('asks for the page, the size, the search and every filter the list state holds', async () => {
      const query = run(
        signal<BookingListParams>({
          page: 2,
          limit: 5,
          q: 'aurora',
          from: '2026-10-01',
          to: '2026-10-31',
          status: 'confirmed',
          locationId: 'loc_1',
          roomId: 'room_1',
          memberId: 'mem_1',
        }),
      );

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      expect(requests).toEqual([
        '/api/v1/bookings?from=2026-10-01&limit=5&locationId=loc_1&memberId=mem_1&page=2&q=aurora&roomId=room_1&status=confirmed&to=2026-10-31',
      ]);
    });

    it('leaves an empty search and unset filters out of the request', async () => {
      const query = run(signal<BookingListParams>({ page: 1, limit: 20, q: '' }));

      await eventually(() => {
        expect(query.value()?.items.length).toBeGreaterThan(0);
      });
      expect(requests).toEqual(['/api/v1/bookings?limit=20&page=1']);
    });

    it('lists the newest first, as the API orders them', async () => {
      const query = run(signal<BookingListParams>({ page: 1, limit: 50, q: '' }));

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      const starts = query.value()?.items.map((b) => b.startsAt) ?? [];
      expect(starts).toEqual([...starts].sort().reverse());
    });

    it('loads only the bookings of the member and the room asked for', async () => {
      const booking = api.db.bookings[0];
      const query = run(
        signal<BookingListParams>({
          page: 1,
          limit: 100,
          q: '',
          memberId: booking.memberId,
          roomId: booking.roomId,
        }),
      );

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      expect(query.value()?.items.length).toBeGreaterThan(0);
      expect(
        query
          .value()
          ?.items.every((b) => b.memberId === booking.memberId && b.roomId === booking.roomId),
      ).toBe(true);
    });

    it('loads the bookings that start within the days, both ends included', async () => {
      const day = api.db.bookings[0].startsAt.slice(0, 10);
      const query = run(
        signal<BookingListParams>({ page: 1, limit: 100, q: '', from: day, to: day }),
      );

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      expect(query.value()?.items.length).toBeGreaterThan(0);
      expect(query.value()?.items.every((b) => b.startsAt.startsWith(day))).toBe(true);
    });

    it('loads again, once, when the list state changes', async () => {
      const params = signal<BookingListParams>({ page: 1, limit: 2, q: '' });
      const query = run(params);
      await eventually(() => {
        expect(query.value()?.page).toBe(1);
      });

      params.set({ page: 2, limit: 2, q: '' });

      await eventually(() => {
        expect(query.value()?.page).toBe(2);
      });
      expect(requests).toEqual([
        '/api/v1/bookings?limit=2&page=1',
        '/api/v1/bookings?limit=2&page=2',
      ]);
    });

    it('reports a failed load as its error', async () => {
      server.use(
        http.get(apiUrl('/bookings'), () =>
          HttpResponse.json({ message: 'Boom' }, { status: 500 }),
        ),
      );
      const query = run(signal<BookingListParams>({ page: 1, limit: 20, q: '' }));

      await eventually(() => {
        expect(query.error()).toMatchObject({ status: 500, message: 'Boom' });
      });
      expect(query.value()).toBeUndefined();
    });
  });

  describe('injectBookingQuery', () => {
    const run = (id: ReturnType<typeof signal<string>>) =>
      TestBed.runInInjectionContext(() => injectBookingQuery(id));

    it('loads the booking with that id', async () => {
      const query = run(signal(api.db.bookings[0].id));

      await eventually(() => {
        expect(query.value()?.id).toBe(api.db.bookings[0].id);
      });
      expect(requests).toEqual([`/api/v1/bookings/${api.db.bookings[0].id}`]);
    });

    it('loads another booking when the id changes, without showing the previous one meanwhile', async () => {
      const id = signal(api.db.bookings[0].id);
      const query = run(id);
      await eventually(() => {
        expect(query.value()?.id).toBe(api.db.bookings[0].id);
      });

      id.set(api.db.bookings[1].id);
      TestBed.tick();
      expect(query.value()).toBeUndefined();

      await eventually(() => {
        expect(query.value()?.id).toBe(api.db.bookings[1].id);
      });
    });

    it('sends an id that is not a plain word as one path segment', async () => {
      const query = run(signal('a/b?c'));

      await eventually(() => {
        expect(query.error()?.status).toBe(404);
      });
      expect(requests).toEqual(['/api/v1/bookings/a%2Fb%3Fc']);
    });

    it('fails with the 404 for a booking that does not exist', async () => {
      const query = run(signal('bk_nope'));

      await eventually(() => {
        expect(query.error()?.status).toBe(404);
      });
      expect(query.error()?.message).toBe('Booking not found');
    });
  });
});
