import { Location as BrowserLocation } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { LOCATION_ROUTES } from '../locations.routes';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

describe('LocationsPage', { timeout: 20_000 }, () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: URL[];
  let names: { all: string[]; inactive: string[] };

  beforeEach(() => {
    api = installMockApi();
    signIn();
    const nameOf = (status?: string) =>
      api.db.locations
        .filter((l) => !status || l.status === status)
        .map((l) => l.name)
        .sort((a, b) => a.localeCompare(b));
    names = { all: nameOf(), inactive: nameOf('inactive') };

    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/locations')) requests.push(url);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  async function open(url = '/locations') {
    const view = await render(Outlet, {
      providers: provideTestSession([{ path: 'locations', children: LOCATION_ROUTES }]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await view.fixture.whenStable();
    return { ...view, router, location: TestBed.inject(BrowserLocation) };
  }

  const rowNames = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0].textContent.trim());
  const queryOf = (url: URL) => Object.fromEntries(url.searchParams);
  const loaded = (expected: string[]) =>
    vi.waitFor(() => {
      expect(rowNames()).toEqual(expected);
    });

  describe('the page', () => {
    it('has a title and a subtitle, and names the tab', async () => {
      await open();

      expect(screen.getByRole('heading', { level: 1, name: 'Locations' })).toBeInTheDocument();
      expect(screen.getByText('Spaces in the network and their opening hours')).toBeInTheDocument();
      await loaded(names.all);
    });

    it('lists the locations with their details, a link to each and a status chip', async () => {
      await open();
      await loaded(names.all);

      const first = api.db.locations.find((l) => l.name === names.all[0]);
      const row = screen.getByRole('row', { name: new RegExp(names.all[0]) });
      expect(within(row).getByRole('link', { name: names.all[0] })).toHaveAttribute(
        'href',
        `/locations/${first?.id}`,
      );
      expect(within(row).getByText(first?.city ?? '')).toBeInTheDocument();
      expect(within(row).getByText(first?.address ?? '')).toBeInTheDocument();
      expect(within(row).getByText(`${first?.opensAt}–${first?.closesAt}`)).toBeInTheDocument();
      expect(within(row).getByText('Active')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Rooms' })).toBeInTheDocument();
    });

    it('asks the API for the first page once', async () => {
      await open();
      await loaded(names.all);

      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1' }]);
    });

    it('opens the details of a location from its name', async () => {
      const { router } = await open();
      await loaded(names.all);

      await userEvent.click(screen.getByRole('link', { name: names.all[0] }));

      await vi.waitFor(() => {
        expect(router.url).toMatch(/^\/locations\/loc_\d+$/);
      });
      expect(
        await screen.findByRole('heading', { level: 1, name: names.all[0] }),
      ).toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('puts the search in the URL and loads the list once', async () => {
      const { location } = await open();
      await loaded(names.all);
      requests.length = 0;

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search name, city or address' }),
        'lisbon',
      );

      await loaded(['Harbour Studio']);
      expect(location.path()).toBe('/locations?q=lisbon');
      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1', q: 'lisbon' }]);
    });

    it('starts from the search the URL carries', async () => {
      await open('/locations?q=kyiv');

      expect(screen.getByRole('searchbox', { name: 'Search name, city or address' })).toHaveValue(
        'kyiv',
      );
      await loaded(['Riverside Hub']);
    });
  });

  describe('the status filter', () => {
    it('narrows the list from page 1 with one request', async () => {
      const { location } = await open('/locations?limit=2&page=2');
      await loaded(names.all.slice(2, 4));
      requests.length = 0;

      await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
      await userEvent.click(screen.getByRole('option', { name: 'Inactive' }));

      await loaded(names.inactive);
      expect(location.path()).toBe('/locations?limit=2&status=inactive');
      expect(requests.map(queryOf)).toEqual([{ limit: '2', page: '1', status: 'inactive' }]);
    });

    it('shows Any status when no filter is set, and takes the filter off again', async () => {
      const { location } = await open('/locations?status=inactive');
      await loaded(names.inactive);
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Inactive');

      await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
      await userEvent.click(screen.getByRole('option', { name: 'Any status' }));

      await loaded(names.all);
      expect(location.path()).toBe('/locations');
    });
  });

  describe('clearing the filters', () => {
    it('is offered only while something narrows the list', async () => {
      await open();
      await loaded(names.all);
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search name, city or address' }),
        'kyiv{Enter}',
      );

      expect(await screen.findByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    });

    it('empties the search and the status together, with one request', async () => {
      const { location } = await open('/locations?q=kyiv&status=active');
      await loaded(['Riverside Hub']);
      requests.length = 0;

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

      await loaded(names.all);
      expect(location.path()).toBe('/locations');
      expect(requests).toHaveLength(1);
      expect(screen.getByRole('searchbox', { name: 'Search name, city or address' })).toHaveValue(
        '',
      );
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Any status');
    });
  });

  describe('pagination', () => {
    it('moves to the next page: the URL changes and exactly one request goes out', async () => {
      const { location } = await open('/locations?limit=2');
      await loaded(names.all.slice(0, 2));
      requests.length = 0;

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

      await loaded(names.all.slice(2, 4));
      expect(location.path()).toBe('/locations?limit=2&page=2');
      expect(requests.map(queryOf)).toEqual([{ limit: '2', page: '2' }]);
      expect(screen.getByText(`3 – 4 of ${names.all.length}`)).toBeInTheDocument();
    });

    it('restores the page from a shared link', async () => {
      await open('/locations?limit=2&page=3');

      await loaded(names.all.slice(4, 6));
    });
  });

  describe('when there is nothing to show', () => {
    it('says that nothing matches the filters', async () => {
      await open('/locations?q=zzzz');

      expect(await screen.findByText('Nothing matches the current filters.')).toBeInTheDocument();
    });

    it('says there are no locations yet when the network has none', async () => {
      api.db.locations = [];

      await open();

      expect(await screen.findByText('No locations yet.')).toBeInTheDocument();
    });
  });

  describe('when the load fails', () => {
    it('shows the reason in the table and loads the list again on request', async () => {
      server.use(
        http.get(
          apiUrl('/locations'),
          () => HttpResponse.json({ message: 'Boom' }, { status: 500 }),
          {
            once: true,
          },
        ),
      );
      await open();

      expect(await screen.findByRole('alert')).toHaveTextContent('Boom');

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      await loaded(names.all);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('creating a location', () => {
    it('opens the form, saves, and goes to the new location', async () => {
      const { router } = await open();
      await loaded(names.all);

      await userEvent.click(screen.getByRole('button', { name: 'New location' }));
      const dialog = await screen.findByRole('dialog', { name: 'New location' }, { timeout: 5000 });
      await userEvent.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Harbour Hub');
      await userEvent.type(within(dialog).getByRole('textbox', { name: /^City/ }), 'Lisbon');
      await userEvent.type(
        within(dialog).getByRole('textbox', { name: /^Address/ }),
        '12 Dock Street',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      await vi.waitFor(() => {
        expect(router.url).toMatch(/^\/locations\/loc_\d+$/);
      });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Harbour Hub' }),
      ).toBeInTheDocument();
      expect(api.db.locations.map((l) => l.name)).toContain('Harbour Hub');
    });

    it('gives focus back to the New location button when the form is cancelled', async () => {
      await open();
      await loaded(names.all);

      await userEvent.click(screen.getByRole('button', { name: 'New location' }));
      const dialog = await screen.findByRole('dialog', { name: 'New location' }, { timeout: 5000 });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'New location' })).toHaveFocus();
      });
    });

    it('stays on the list when the form is cancelled', async () => {
      const { router } = await open();
      await loaded(names.all);

      await userEvent.click(screen.getByRole('button', { name: 'New location' }));
      const dialog = await screen.findByRole('dialog', { name: 'New location' }, { timeout: 5000 });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(router.url).toBe('/locations');
    });
  });
});
