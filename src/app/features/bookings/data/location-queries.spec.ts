import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { injectLocationById, injectLocationsQuery } from './location-queries';

describe('location queries', () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    TestBed.configureTestingModule({ providers: provideTestApi() });
    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.includes('/locations')) requests.push(`${url.pathname}${url.search}`);
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

  describe('injectLocationsQuery', () => {
    it('loads one page of the biggest size the API allows, with the time zones', async () => {
      const query = TestBed.runInInjectionContext(injectLocationsQuery);

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      expect(requests).toEqual(['/api/v1/locations?limit=100&page=1']);
      const zones = (items: { id: string; timezone: string }[] = []) =>
        items.map((l) => `${l.id} ${l.timezone}`).sort();
      expect(zones(query.value()?.items)).toEqual(zones(api.db.locations));
    });

    it('reports a failed load as its error', async () => {
      server.use(
        http.get(apiUrl('/locations'), () =>
          HttpResponse.json({ message: 'Boom' }, { status: 500 }),
        ),
      );
      const query = TestBed.runInInjectionContext(injectLocationsQuery);

      await eventually(() => {
        expect(query.error()).toMatchObject({ status: 500, message: 'Boom' });
      });
    });
  });

  describe('injectLocationById', () => {
    const run = (id: ReturnType<typeof signal<string | undefined>>) =>
      TestBed.runInInjectionContext(() => injectLocationById(id));

    it('asks for nothing without an id', async () => {
      const query = run(signal(undefined));

      TestBed.tick();
      await TestBed.inject(ApplicationRef).whenStable();

      expect(requests).toEqual([]);
      expect(query.value()).toBeUndefined();
      expect(query.error()).toBeUndefined();
    });

    it('asks for nothing for an empty id, which is what a booking of a deleted room carries', async () => {
      run(signal(''));

      TestBed.tick();
      await TestBed.inject(ApplicationRef).whenStable();

      expect(requests).toEqual([]);
    });

    it('loads the location with that id, and another when the id changes', async () => {
      const id = signal<string | undefined>(api.db.locations[0].id);
      const query = run(id);
      await eventually(() => {
        expect(query.value()?.timezone).toBe(api.db.locations[0].timezone);
      });

      id.set(api.db.locations[2].id);
      TestBed.tick();
      expect(query.value()).toBeUndefined();

      await eventually(() => {
        expect(query.value()?.id).toBe(api.db.locations[2].id);
      });
      expect(requests).toEqual([
        `/api/v1/locations/${api.db.locations[0].id}`,
        `/api/v1/locations/${api.db.locations[2].id}`,
      ]);
    });

    it('fails with the 404 for a location that does not exist', async () => {
      const query = run(signal('loc_nope'));

      await eventually(() => {
        expect(query.error()?.status).toBe(404);
      });
    });
  });
});
