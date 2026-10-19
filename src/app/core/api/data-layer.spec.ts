import { OverlayContainer } from '@angular/cdk/overlay';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ON_UNAUTHORIZED } from '@core/http/session-hooks';
import {
  type Booking,
  type Location,
  type LocationInput,
  locationSchema,
  pageOf,
} from '@shared/api/contract';
import { findBookedSlot, installMockApi, signIn } from '@testing/mock-api';
import { provideTestApi } from '@testing/test-providers';
import { createMutation } from './create-mutation';
import { createQuery } from './create-query';
import { parseResponse } from './parse-response';
import { removedTags, savedTags, listTag } from './tags';

const locationPage = pageOf(locationSchema);

const NEW_LOCATION: LocationInput = {
  name: 'Harbour Hub',
  city: 'Lisbon',
  address: '12 Dock Street',
  timezone: 'Europe/Lisbon',
  opensAt: '08:00',
  closesAt: '20:00',
  status: 'active',
};

/** The data layer end to end: real interceptors, cache and tags against the mock API over MSW. */
describe('data layer against the mock API', () => {
  let onUnauthorized: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onUnauthorized = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideTestApi(), { provide: ON_UNAUTHORIZED, useValue: onUnauthorized }],
    });
  });

  const injector = () => TestBed.inject(Injector);
  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');

  const locations = (params: Record<string, string | number> = {}) =>
    createQuery({
      request: () => ({ url: '/locations', params }),
      tags: () => [listTag('Location')],
      parse: parseResponse(locationPage, 'GET /locations'),
      injector: injector(),
    });

  const createLocation = () =>
    createMutation<LocationInput, Location>({
      request: (body) => ({ method: 'POST', url: '/locations', body, silent: true }),
      invalidates: () => savedTags('Location'),
      injector: injector(),
    });

  /** Runs change detection until the check holds, as the page would see it. */
  const eventually = (check: () => void) =>
    vi.waitFor(() => {
      TestBed.tick();
      check();
    });

  it('loads a validated page, signed in as the demo admin', async () => {
    installMockApi();
    signIn();

    const page = locations({ limit: 3 });

    await eventually(() => {
      expect(page.value()?.items).toHaveLength(3);
    });
    expect(page.value()?.limit).toBe(3);
    expect(page.error()).toBeUndefined();
  });

  it('reports a missing session once to the hook, with no snackbar of its own, and fails the query', async () => {
    installMockApi();

    const page = locations();

    await eventually(() => {
      expect(page.error()?.status).toBe(401);
    });
    expect(onUnauthorized).toHaveBeenCalledExactlyOnceWith(null);
    expect(snackbars()).toHaveLength(0);
  });

  it('shows a new location in the list that is already on screen', async () => {
    installMockApi();
    signIn();
    const page = locations({ limit: 100 });
    await eventually(() => {
      expect(page.value()).toBeDefined();
    });
    const before = page.value()?.total ?? 0;

    const created = await createLocation().run(NEW_LOCATION);

    expect(created.name).toBe('Harbour Hub');
    await eventually(() => {
      expect(page.value()?.total).toBe(before + 1);
    });
    expect(page.value()?.items.map((l) => l.name)).toContain('Harbour Hub');
  });

  it('keeps a form error out of the snackbar and hands the field errors to the form', async () => {
    installMockApi();
    signIn();
    const create = createLocation();

    await expect(create.run({ ...NEW_LOCATION, name: 'X' })).rejects.toBeDefined();

    expect(create.error()).toMatchObject({
      status: 422,
      fieldErrors: { name: 'At least 2 characters' },
    });
    expect(snackbars()).toHaveLength(0);
  });

  it('shows the reason of a refused delete in the snackbar', async () => {
    installMockApi();
    signIn();
    const page = locations({ limit: 100 });
    await eventually(() => {
      expect(page.value()).toBeDefined();
    });
    const withRooms = page.value()?.items.find((l) => l.roomCount > 0);
    const remove = createMutation<string, null>({
      request: (id) => ({ method: 'DELETE', url: `/locations/${id}` }),
      invalidates: () => removedTags('Location'),
      injector: injector(),
    });

    await expect(remove.run(withRooms?.id ?? '')).rejects.toBeDefined();

    expect(remove.error()?.status).toBe(409);
    await eventually(() => {
      expect(snackbars()).toHaveLength(1);
    });
    expect(snackbars()[0]).toHaveTextContent('Remove or move the rooms of this location first');
  });

  it('gives the form the bookings that block an overlapping slot', async () => {
    const api = installMockApi();
    signIn();
    const { existing, room, member } = findBookedSlot(api);
    const book = createMutation<object, Booking>({
      request: (body) => ({ method: 'POST', url: '/bookings', body, silent: true }),
      injector: injector(),
    });

    await expect(
      book.run({
        roomId: room.id,
        memberId: member.id,
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
        attendees: 1,
        notes: null,
      }),
    ).rejects.toBeDefined();

    expect(book.error()?.status).toBe(409);
    expect(book.error()?.conflicts.map((c) => c.id)).toContain(existing.id);
  });
});
