import { OverlayContainer } from '@angular/cdk/overlay';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createQuery } from '@core/api/create-query';
import { listTag } from '@core/api/tags';
import type { LocationInput } from '@shared/api/contract';
import { installMockApi, signIn } from '@testing/mock-api';
import { server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import {
  injectCreateLocation,
  injectDeleteLocation,
  injectUpdateLocation,
} from './location-mutations';
import { injectLocationQuery, injectLocationsQuery } from './location-queries';

const INPUT: LocationInput = {
  name: 'Harbour Hub',
  city: 'Lisbon',
  address: '12 Dock Street',
  timezone: 'Europe/Lisbon',
  opensAt: '08:00',
  closesAt: '20:00',
  status: 'active',
};

describe('location mutations', () => {
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
  const countOf = (request: string) => requests.filter((r) => r === request).length;

  /** Queries on screen that show a location, a list and what embeds one: a booking list. */
  async function mountQueries() {
    const list = inject(() => injectLocationsQuery(() => ({ page: 1, limit: 20, q: '' })));
    const detail = inject(() => injectLocationQuery(() => 'loc_1'));
    const bookings = createQuery({
      request: () => ({ url: '/bookings', params: { limit: 1 } }),
      tags: () => [listTag('Booking')],
      injector: TestBed.inject(Injector),
    });
    const members = createQuery({
      request: () => ({ url: '/members', params: { limit: 1 } }),
      tags: () => [listTag('Member')],
      injector: TestBed.inject(Injector),
    });
    await eventually(() => {
      expect(list.value() && detail.value() && bookings.value() && members.value()).toBeTruthy();
    });
    requests.length = 0;
    return { list, detail, bookings, members };
  }

  describe('injectCreateLocation', () => {
    it('posts the input and resolves with the created location', async () => {
      const create = inject(injectCreateLocation);

      const created = await create.run(INPUT);

      expect(created).toMatchObject({ ...INPUT, roomCount: 0 });
      expect(api.db.locations.some((l) => l.id === created.id)).toBe(true);
      expect(requests).toEqual(['POST /locations']);
    });

    it('reloads the lists, and what embeds a location, but not other details or members', async () => {
      const { list, detail, bookings, members } = await mountQueries();
      const create = inject(injectCreateLocation);

      const created = await create.run(INPUT);

      await eventually(() => {
        expect(list.value()?.items.map((l) => l.id)).toContain(created.id);
      });
      expect(countOf('GET /locations')).toBe(1);
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf('GET /members')).toBe(0);
      expect(detail.value()?.id).toBe('loc_1');
      expect(members.value()).toBeDefined();
      expect(bookings.value()).toBeDefined();
    });

    it('leaves the refusal to the form: no snackbar, the rejection carries the field errors', async () => {
      const create = inject(injectCreateLocation);

      await expect(create.run({ ...INPUT, name: 'x' })).rejects.toMatchObject({ status: 422 });

      expect(create.error()?.fieldErrors).toEqual({ name: 'At least 2 characters' });
      expect(snackbars()).toHaveLength(0);
    });

    it('invalidates nothing when it fails', async () => {
      const { list } = await mountQueries();
      const create = inject(injectCreateLocation);

      await expect(create.run({ ...INPUT, name: 'x' })).rejects.toBeDefined();
      await new Promise((resolve) => setTimeout(resolve, 20));
      TestBed.tick();

      expect(requests).toEqual(['POST /locations']);
      expect(list.value()).toBeDefined();
    });
  });

  describe('injectUpdateLocation', () => {
    it('patches that location with the whole input', async () => {
      const update = inject(injectUpdateLocation);

      const saved = await update.run({ id: 'loc_1', input: INPUT });

      expect(saved).toMatchObject({ id: 'loc_1', name: 'Harbour Hub' });
      expect(api.db.locations.find((l) => l.id === 'loc_1')?.city).toBe('Lisbon');
      expect(requests).toEqual(['PATCH /locations/loc_1']);
    });

    it('reloads its own detail, the lists and what embeds a location', async () => {
      const { detail, list, bookings, members } = await mountQueries();
      const update = inject(injectUpdateLocation);

      await update.run({ id: 'loc_1', input: INPUT });

      await eventually(() => {
        expect(detail.value()?.name).toBe('Harbour Hub');
      });
      expect(countOf('GET /locations/loc_1')).toBe(1);
      expect(countOf('GET /locations')).toBe(1);
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf('GET /members')).toBe(0);
      expect(list.value()?.items.find((l) => l.id === 'loc_1')?.name).toBe('Harbour Hub');
      expect(bookings.value()).toBeDefined();
      expect(members.value()).toBeDefined();
    });

    it('does not reload the detail of another location', async () => {
      await mountQueries();
      const other = inject(() => injectLocationQuery(() => 'loc_2'));
      await eventually(() => {
        expect(other.value()).toBeDefined();
      });
      requests.length = 0;
      const update = inject(injectUpdateLocation);

      await update.run({ id: 'loc_1', input: INPUT });
      await eventually(() => {
        expect(countOf('GET /locations/loc_1')).toBe(1);
      });

      expect(countOf('GET /locations/loc_2')).toBe(0);
    });

    it('is silent too, and a missing location comes back as a 404 for the form', async () => {
      const update = inject(injectUpdateLocation);

      await expect(update.run({ id: 'loc_nope', input: INPUT })).rejects.toMatchObject({
        status: 404,
      });

      expect(snackbars()).toHaveLength(0);
    });
  });

  describe('injectDeleteLocation', () => {
    async function createEmptyLocation() {
      return inject(injectCreateLocation).run(INPUT);
    }

    it('deletes the location', async () => {
      const { id } = await createEmptyLocation();
      requests.length = 0;
      const remove = inject(injectDeleteLocation);

      await remove.run(id);

      expect(api.db.locations.some((l) => l.id === id)).toBe(false);
      expect(requests).toEqual([`DELETE /locations/${id}`]);
    });

    it('reloads the lists and what embeds a location, but not the deleted detail', async () => {
      const { id } = await createEmptyLocation();
      const list = inject(() => injectLocationsQuery(() => ({ page: 1, limit: 20, q: '' })));
      const detail = inject(() => injectLocationQuery(() => id));
      const bookings = createQuery({
        request: () => ({ url: '/bookings', params: { limit: 1 } }),
        tags: () => [listTag('Booking')],
        injector: TestBed.inject(Injector),
      });
      await eventually(() => {
        expect(list.value() && detail.value() && bookings.value()).toBeTruthy();
      });
      requests.length = 0;
      const remove = inject(injectDeleteLocation);

      await remove.run(id);

      await eventually(() => {
        expect(list.value()?.items.map((l) => l.id)).not.toContain(id);
      });
      expect(countOf('GET /locations')).toBe(1);
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf(`GET /locations/${id}`)).toBe(0);
      expect(detail.error()).toBeUndefined();
    });

    it('is not silent: a location with rooms is refused with a snackbar carrying the reason', async () => {
      const remove = inject(injectDeleteLocation);

      await expect(remove.run('loc_1')).rejects.toMatchObject({ status: 409 });

      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Remove or move the rooms of this location first');
      expect(remove.error()?.status).toBe(409);
    });
  });
});
