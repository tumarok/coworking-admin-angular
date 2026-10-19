import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TagRegistry } from '@core/api/tag-registry';
import { listTag, savedTags } from '@core/api/tags';
import { BOOKING_STATUSES } from '@shared/api/contract';
import { installMockApi, signIn, TEST_NOW } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { injectDashboardQuery } from './dashboard-queries';

describe('injectDashboardQuery', () => {
  let requests: string[];

  beforeEach(() => {
    installMockApi();
    signIn();
    TestBed.configureTestingModule({ providers: provideTestApi() });
    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/dashboard')) requests.push(`${url.pathname}${url.search}`);
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
  const run = (date: ReturnType<typeof signal<string>>) =>
    TestBed.runInInjectionContext(() => injectDashboardQuery(date));

  it('asks for the day it is given', async () => {
    const query = run(signal('2026-10-12'));

    await eventually(() => {
      expect(query.value()?.date).toBe('2026-10-12');
    });
    expect(requests).toEqual(['/api/v1/dashboard?date=2026-10-12']);
  });

  it('loads the figures of the day, with the next bookings from the mock’s clock', async () => {
    const query = run(signal('2026-10-14'));

    await eventually(() => {
      expect(query.value()).toBeDefined();
    });
    const dashboard = query.value();
    expect(Object.keys(dashboard?.byStatus ?? {}).sort()).toEqual([...BOOKING_STATUSES].sort());
    expect(dashboard?.upcoming.length).toBeLessThanOrEqual(8);
    expect(dashboard?.upcoming.every((b) => Date.parse(b.startsAt) >= TEST_NOW)).toBe(true);
  });

  it('loads again, once, for another day, keeping the last figures until they arrive', async () => {
    const date = signal('2026-10-12');
    const query = run(date);
    await eventually(() => {
      expect(query.value()?.date).toBe('2026-10-12');
    });

    date.set('2026-10-13');
    TestBed.tick();
    expect(query.value()?.date).toBe('2026-10-12');

    await eventually(() => {
      expect(query.value()?.date).toBe('2026-10-13');
    });
    expect(requests).toEqual([
      '/api/v1/dashboard?date=2026-10-12',
      '/api/v1/dashboard?date=2026-10-13',
    ]);
  });

  it('loads again when a booking is saved, as the figures count bookings', async () => {
    const query = run(signal('2026-10-12'));
    await eventually(() => {
      expect(query.value()).toBeDefined();
    });

    TestBed.inject(TagRegistry).invalidate(savedTags('Booking', 'bk_1'));

    await eventually(() => {
      expect(requests).toHaveLength(2);
    });
  });

  it.each(['Room', 'Location', 'Member'] as const)(
    'loads again when a %s changes',
    async (type) => {
      const query = run(signal('2026-10-12'));
      await eventually(() => {
        expect(query.value()).toBeDefined();
      });

      TestBed.inject(TagRegistry).invalidate(savedTags(type));

      await eventually(() => {
        expect(requests).toHaveLength(2);
      });
    },
  );

  it('does not load again for a change of the bookings list alone, which it does not show', async () => {
    const query = run(signal('2026-10-12'));
    await eventually(() => {
      expect(query.value()).toBeDefined();
    });

    TestBed.inject(TagRegistry).invalidate([listTag('Booking')]);
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(requests).toHaveLength(1);
  });

  it('reports a failed load as its error', async () => {
    server.use(
      http.get(apiUrl('/dashboard'), () => HttpResponse.json({ message: 'Boom' }, { status: 500 })),
    );
    const query = run(signal('2026-10-12'));

    await eventually(() => {
      expect(query.error()).toMatchObject({ status: 500, message: 'Boom' });
    });
    expect(query.value()).toBeUndefined();
  });
});
