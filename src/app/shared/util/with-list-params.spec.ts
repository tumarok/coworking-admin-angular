import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { signalStore } from '@ngrx/signals';
import { render } from '@testing-library/angular';
import { provideTestApp } from '@testing/test-providers';
import { dateFilter, enumFilter, textFilter } from './list-params';
import { withListParams } from './with-list-params';

const STATUSES = ['active', 'inactive'] as const;

const ListStore = signalStore(
  withListParams({
    filters: { status: enumFilter(STATUSES), city: textFilter, from: dateFilter },
  }),
);

@Component({ template: '', providers: [ListStore] })
class ListPage {
  readonly store = inject(ListStore);
}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

describe('withListParams', () => {
  async function open(url: string) {
    const { fixture } = await render(Outlet, {
      providers: provideTestApp([{ path: 'list', component: ListPage }]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await fixture.whenStable();
    const store = fixture.debugElement.query(By.directive(ListPage)).componentInstance as ListPage;
    return { store: store.store, router, location: TestBed.inject(Location) };
  }

  it('reads the list state from the URL', async () => {
    const { store } = await open('/list?page=3&limit=50&q=desk&status=active');

    expect(store.params()).toEqual({ page: 3, limit: 50, q: 'desk', status: 'active' });
    expect(store.hasActiveFilters()).toBe(true);
  });

  it('survives garbage in the URL', async () => {
    const { store } = await open('/list?page=x&limit=-1&status=archived&from=2026-99-99');

    expect(store.params()).toEqual({ page: 1, limit: 20, q: '' });
    expect(store.hasActiveFilters()).toBe(false);
  });

  it('follows the URL when it changes from outside', async () => {
    const { store, router } = await open('/list');
    expect(store.params().page).toBe(1);

    await router.navigateByUrl('/list?page=2&city=Porto');

    expect(store.params()).toEqual({ page: 2, limit: 20, q: '', city: 'Porto' });
  });

  it('writes a filter to the URL and returns to the first page', async () => {
    const { store, location } = await open('/list?page=4&limit=10');

    await store.setFilter('status', 'inactive');

    expect(location.path()).toBe('/list?limit=10&status=inactive');
    expect(store.params()).toEqual({ page: 1, limit: 10, q: '', status: 'inactive' });
  });

  it('removes a filter when it is cleared', async () => {
    const { store, location } = await open('/list?status=active&city=Porto');

    await store.setFilter('status', undefined);

    expect(location.path()).toBe('/list?city=Porto');
  });

  it('writes the search trimmed and returns to the first page', async () => {
    const { store, location } = await open('/list?page=2');

    await store.setSearch('  hot desk ');

    expect(location.path()).toBe('/list?q=hot%20desk');
    expect(store.params().q).toBe('hot desk');
  });

  it('keeps the page and does not navigate when a value does not change', async () => {
    const { store, router, location } = await open('/list?page=2&q=desk');
    const navigate = vi.spyOn(router, 'navigate');

    expect(await store.setSearch(' desk ')).toBe(false);
    expect(await store.setFilter('status', undefined)).toBe(false);

    expect(navigate).not.toHaveBeenCalled();
    expect(location.path()).toBe('/list?page=2&q=desk');
  });

  it('sets the page, and the first page leaves the URL', async () => {
    const { store, location } = await open('/list');

    await store.setPage(3);
    expect(location.path()).toBe('/list?page=3');

    await store.setPage(1);
    expect(location.path()).toBe('/list');
  });

  it('changes the page size from page 1', async () => {
    const { store, location } = await open('/list?page=5');

    await store.setLimit(50);

    expect(location.path()).toBe('/list?limit=50');
    expect(store.params().page).toBe(1);
  });

  it('applies what a paginator reports', async () => {
    const { store, location } = await open('/list?limit=10');

    await store.paginate({ page: 2, limit: 10 });
    expect(location.path()).toBe('/list?limit=10&page=2');

    await store.paginate({ page: 2, limit: 20 });
    expect(location.path()).toBe('/list');
  });

  it('composes calls made before the first navigation has finished', async () => {
    const { store, location } = await open('/list?page=3');

    const first = store.setSearch('desk');
    const second = store.setFilter('status', 'active');
    const third = store.setLimit(50);
    await Promise.all([first, second, third]);

    expect(location.path()).toBe('/list?limit=50&q=desk&status=active');
    expect(store.params()).toEqual({ page: 1, limit: 50, q: 'desk', status: 'active' });
  });

  it('keeps a requested page when a later call in the same tick changes nothing else', async () => {
    const { store, location } = await open('/list');

    const first = store.setPage(4);
    const unchanged = store.setPage(4);
    await Promise.all([first, unchanged]);

    expect(await unchanged).toBe(false);
    expect(location.path()).toBe('/list?page=4');
  });

  it('builds on the URL again once the navigation has settled', async () => {
    const { store, router, location } = await open('/list');
    await store.setSearch('a');

    await router.navigateByUrl('/list?q=b&page=2');
    await store.setFilter('status', 'inactive');

    expect(location.path()).toBe('/list?q=b&status=inactive');
  });

  it('applies several changes in one navigation', async () => {
    const { store, router, location } = await open('/list?page=3');
    const navigate = vi.spyOn(router, 'navigate');

    await store.patch({ q: 'a', status: 'active', city: 'Porto' });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(location.path()).toBe('/list?q=a&status=active&city=Porto');
  });

  it('clears the search and the filters but keeps the page size', async () => {
    const { store, location } = await open('/list?page=2&limit=50&q=x&status=active&city=Porto');

    await store.reset();

    expect(location.path()).toBe('/list?limit=50');
    expect(store.hasActiveFilters()).toBe(false);
  });

  it('leaves the query parameters of other concerns alone', async () => {
    const { store, location } = await open('/list?date=2026-10-12');

    await store.setPage(2);

    expect(location.path()).toBe('/list?date=2026-10-12&page=2');
  });

  it('replaces the history entry instead of adding one', async () => {
    const { store, location } = await open('/list');
    const length = history.length;

    await store.setPage(2);
    await store.setSearch('x');

    expect(history.length).toBe(length);
    expect(location.path()).toBe('/list?q=x');
  });

  it('keeps the same params object while an unrelated parameter changes', async () => {
    const { store, router } = await open('/list?q=x');
    const before = store.params();

    await router.navigateByUrl('/list?q=x&date=2026-10-12');

    expect(store.params()).toBe(before);
  });

  it('rejects a filter that takes a key the list state owns', () => {
    expect(() => withListParams({ filters: { page: textFilter } })).toThrow(/reserved keys: page/);
  });
});
