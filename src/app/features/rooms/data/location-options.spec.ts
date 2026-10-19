import { TestBed } from '@angular/core/testing';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { injectLocationOptions } from './location-options';

describe('injectLocationOptions', () => {
  let api: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    api = installMockApi();
    signIn();
    TestBed.configureTestingModule({ providers: provideTestApi() });
  });

  const eventually = (check: () => void) =>
    vi.waitFor(() => {
      TestBed.tick();
      check();
    });

  it('offers every location, by name, as a value (its id) and a label (its name)', async () => {
    const locations = TestBed.runInInjectionContext(injectLocationOptions);
    expect(locations.options()).toEqual([]);
    expect(locations.loaded()).toBe(false);

    await eventually(() => {
      expect(locations.options().length).toBeGreaterThan(0);
    });
    const names = api.db.locations.map((l) => l.name).sort((a, b) => a.localeCompare(b));
    expect(locations.options().map((o) => o.label)).toEqual(names);
    const first = api.db.locations.find((l) => l.name === names[0]);
    expect(locations.options()[0]).toEqual({ value: first?.id, label: names[0] });
    expect(locations.loaded()).toBe(true);
    expect(locations.error()).toBeUndefined();
  });

  it('asks for one page of the biggest size the API allows', async () => {
    const requests: string[] = [];
    server.events.on('request:start', ({ request }) => {
      requests.push(new URL(request.url).search);
    });
    const locations = TestBed.runInInjectionContext(injectLocationOptions);

    await eventually(() => {
      expect(locations.options().length).toBeGreaterThan(0);
    });
    server.events.removeAllListeners();

    expect(requests).toEqual(['?limit=100&page=1']);
  });

  it('offers nothing, and reports why, when the locations cannot be loaded', async () => {
    server.use(
      http.get(apiUrl('/locations'), () => HttpResponse.json({ message: 'Boom' }, { status: 500 })),
    );
    const locations = TestBed.runInInjectionContext(injectLocationOptions);

    await eventually(() => {
      expect(locations.error()).toMatchObject({ status: 500, message: 'Boom' });
    });
    expect(locations.options()).toEqual([]);
    expect(locations.loaded()).toBe(false);
  });
});
