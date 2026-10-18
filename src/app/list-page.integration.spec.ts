import { Location as BrowserLocation } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { signalStore } from '@ngrx/signals';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { createQuery } from '@core/api/create-query';
import { parseResponse } from '@core/api/parse-response';
import { listTag } from '@core/api/tags';
import { LOCATION_STATUSES, type Location, locationSchema, pageOf } from '@shared/api/contract';
import { DataTable, type DataTableColumn } from '@shared/ui/data-table';
import { DataTableCell } from '@shared/ui/data-table-cell';
import { PageHeader } from '@shared/ui/page-header';
import { StatusChip } from '@shared/ui/status-chip';
import { enumFilter } from '@shared/util/list-params';
import { withListParams } from '@shared/util/with-list-params';
import { installMockApi, signIn } from '@testing/mock-api';
import { server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';

/**
 * A list page assembled the way a feature will assemble one: the URL-backed list state, a query on
 * the data layer that follows it, and the shared table, all against the mock API over HTTP.
 */
const LocationListStore = signalStore(
  withListParams({ filters: { status: enumFilter(LOCATION_STATUSES) } }),
);

const columns: DataTableColumn<Location>[] = [
  { key: 'name', header: 'Name', value: (l) => l.name, link: (l) => ['/locations', l.id] },
  { key: 'city', header: 'City', value: (l) => l.city },
  { key: 'status', header: 'Status' },
];

@Component({
  imports: [DataTable, DataTableCell, PageHeader, StatusChip],
  providers: [LocationListStore],
  template: `
    <app-page-header title="Locations">
      <button type="button" (click)="store.setFilter('status', 'inactive')">Inactive only</button>
      <button type="button" (click)="store.reset()">Clear filters</button>
    </app-page-header>
    <app-data-table
      caption="Locations"
      [columns]="columns"
      [rows]="locations.value()?.items"
      [total]="locations.value()?.total ?? 0"
      [page]="store.params().page"
      [limit]="store.params().limit"
      [fetching]="locations.isFetching()"
      emptyMessage="Nothing matches the current filters."
      [error]="locations.error()?.message"
      (pageChange)="store.paginate($event)"
      (retry)="locations.refresh()"
    >
      <ng-template appCell="status" let-row><app-status-chip [status]="row.status" /></ng-template>
    </app-data-table>
  `,
})
class LocationsPage {
  protected readonly store = inject(LocationListStore);
  protected readonly columns = columns;
  protected readonly locations = createQuery({
    request: () => ({ url: '/locations', params: this.store.params() }),
    tags: () => [listTag('Location')],
    parse: parseResponse(pageOf(locationSchema), 'GET /locations'),
  });
}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

describe('a list page on the URL-backed list state', () => {
  let requests: URL[];
  let names: { all: string[]; active: string[]; inactive: string[] };

  beforeEach(() => {
    const api = installMockApi();
    signIn();
    const nameOf = (status?: string) =>
      api.db.locations
        .filter((l) => !status || l.status === status)
        .map((l) => l.name)
        .sort((a, b) => a.localeCompare(b));
    names = { all: nameOf(), active: nameOf('active'), inactive: nameOf('inactive') };

    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/locations')) requests.push(url);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  async function open(url: string) {
    const view = await render(Outlet, {
      providers: [
        provideRouter([{ path: 'locations', component: LocationsPage }]),
        provideTestApi(),
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return { ...view, router, location: TestBed.inject(BrowserLocation) };
  }

  const rowNames = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0].textContent.trim());

  const queryOf = (url: URL) => Object.fromEntries(url.searchParams);

  it('loads the page the URL names with one request', async () => {
    await open('/locations?limit=2');

    await vi.waitFor(() => {
      expect(rowNames()).toEqual(names.all.slice(0, 2));
    });
    expect(requests.map(queryOf)).toEqual([{ limit: '2', page: '1' }]);
    expect(screen.getByText(`1 – 2 of ${names.all.length}`)).toBeInTheDocument();
  });

  it('moves to the next page: the URL changes and exactly one request goes out', async () => {
    const { location } = await open('/locations?limit=2');
    await vi.waitFor(() => {
      expect(rowNames()).toEqual(names.all.slice(0, 2));
    });
    requests.length = 0;

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

    await vi.waitFor(() => {
      expect(rowNames()).toEqual(names.all.slice(2, 4));
    });
    expect(location.path()).toBe('/locations?limit=2&page=2');
    expect(requests.map(queryOf)).toEqual([{ limit: '2', page: '2' }]);
    expect(screen.getByText(`3 – 4 of ${names.all.length}`)).toBeInTheDocument();
  });

  it('applies a filter from page 1 with exactly one request', async () => {
    const { location } = await open('/locations?limit=2&page=2');
    await vi.waitFor(() => {
      expect(rowNames()).toEqual(names.all.slice(2, 4));
    });
    requests.length = 0;

    await userEvent.click(screen.getByRole('button', { name: 'Inactive only' }));

    await vi.waitFor(() => {
      expect(rowNames()).toEqual(names.inactive);
    });
    expect(location.path()).toBe('/locations?limit=2&status=inactive');
    expect(requests.map(queryOf)).toEqual([{ limit: '2', page: '1', status: 'inactive' }]);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('clears the filters with one request and keeps the page size', async () => {
    const { location } = await open('/locations?limit=2&status=inactive');
    await vi.waitFor(() => {
      expect(rowNames()).toEqual(names.inactive);
    });
    requests.length = 0;

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    await vi.waitFor(() => {
      expect(rowNames()).toEqual(names.all.slice(0, 2));
    });
    expect(location.path()).toBe('/locations?limit=2');
    expect(requests).toHaveLength(1);
  });

  it('restores the list from a shared link', async () => {
    await open('/locations?limit=2&page=2&status=active');

    await vi.waitFor(() => {
      expect(rowNames()).toEqual(names.active.slice(2, 4));
    });
    expect(requests.map(queryOf)).toEqual([{ limit: '2', page: '2', status: 'active' }]);
    expect(screen.getByText(`3 – 4 of ${names.active.length}`)).toBeInTheDocument();
  });

  it('shows the first page when the URL is garbage, without a request the API would refuse', async () => {
    await open('/locations?page=abc&limit=-3&status=archived&q=%20');

    await vi.waitFor(() => {
      expect(rowNames()).toEqual(names.all);
    });
    expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1' }]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an empty page when the filter matches nothing', async () => {
    await open('/locations?q=zzzz');

    expect(await screen.findByText('Nothing matches the current filters.')).toBeInTheDocument();
    expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1', q: 'zzzz' }]);
  });
});
