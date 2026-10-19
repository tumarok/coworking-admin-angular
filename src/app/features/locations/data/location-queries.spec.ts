import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import {
  type LocationListParams,
  injectLocationQuery,
  injectLocationsQuery,
} from './location-queries';

describe('location queries', () => {
  let requests: string[];

  beforeEach(() => {
    installMockApi();
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
    const run = (params: ReturnType<typeof signal<LocationListParams>>) =>
      TestBed.runInInjectionContext(() => injectLocationsQuery(params));

    it('asks for the page, the size, the search and the status the list state holds', async () => {
      const query = run(signal({ page: 2, limit: 3, q: 'kyiv', status: 'active' }));

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      expect(requests).toEqual(['/api/v1/locations?limit=3&page=2&q=kyiv&status=active']);
      expect(query.value()?.page).toBe(2);
    });

    it('leaves an empty search and an unset status out of the request', async () => {
      const query = run(signal({ page: 1, limit: 20, q: '' }));

      await eventually(() => {
        expect(query.value()?.items.length).toBeGreaterThan(0);
      });
      expect(requests).toEqual(['/api/v1/locations?limit=20&page=1']);
    });

    it('loads again, once, when the list state changes', async () => {
      const params = signal<LocationListParams>({ page: 1, limit: 2, q: '' });
      const query = run(params);
      await eventually(() => {
        expect(query.value()?.page).toBe(1);
      });

      params.set({ page: 2, limit: 2, q: '' });

      await eventually(() => {
        expect(query.value()?.page).toBe(2);
      });
      expect(requests).toEqual([
        '/api/v1/locations?limit=2&page=1',
        '/api/v1/locations?limit=2&page=2',
      ]);
    });

    it('reports a failed load as its error', async () => {
      server.use(
        http.get(apiUrl('/locations'), () =>
          HttpResponse.json({ message: 'Boom' }, { status: 500 }),
        ),
      );
      const query = run(signal({ page: 1, limit: 20, q: '' }));

      await eventually(() => {
        expect(query.error()).toMatchObject({ status: 500, message: 'Boom' });
      });
      expect(query.value()).toBeUndefined();
    });
  });

  describe('injectLocationQuery', () => {
    const run = (id: ReturnType<typeof signal<string>>) =>
      TestBed.runInInjectionContext(() => injectLocationQuery(id));

    it('loads the location with that id', async () => {
      const query = run(signal('loc_1'));

      await eventually(() => {
        expect(query.value()?.id).toBe('loc_1');
      });
      expect(requests).toEqual(['/api/v1/locations/loc_1']);
    });

    it('loads another location when the id changes, without showing the previous one meanwhile', async () => {
      const id = signal('loc_1');
      const query = run(id);
      await eventually(() => {
        expect(query.value()?.id).toBe('loc_1');
      });

      id.set('loc_2');
      TestBed.tick();
      expect(query.value()).toBeUndefined();

      await eventually(() => {
        expect(query.value()?.id).toBe('loc_2');
      });
    });

    it('sends an id that is not a plain word as one path segment', async () => {
      const query = run(signal('a/b?c'));

      await eventually(() => {
        expect(query.error()?.status).toBe(404);
      });
      expect(requests).toEqual(['/api/v1/locations/a%2Fb%3Fc']);
    });

    it('fails with the 404 for a location that does not exist', async () => {
      const query = run(signal('loc_nope'));

      await eventually(() => {
        expect(query.error()?.status).toBe(404);
      });
      expect(query.error()?.message).toBe('Location not found');
    });
  });
});
