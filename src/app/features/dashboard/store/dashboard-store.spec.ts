import { Location } from '@angular/common';
import { ApplicationRef, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { TEST_NOW } from '@testing/mock-api';
import { provideTestApp } from '@testing/test-providers';
import { DashboardStore } from './dashboard-store';

let store: InstanceType<typeof DashboardStore>;

@Component({
  template: '<output>{{ store.date() }}</output>',
  providers: [DashboardStore],
})
class Page {
  protected readonly store = inject(DashboardStore);

  constructor() {
    store = this.store;
  }
}

@Component({ template: '' })
class Elsewhere {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

describe('DashboardStore', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TEST_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function open(url: string) {
    await render(Outlet, {
      providers: provideTestApp([
        { path: 'elsewhere', component: Elsewhere },
        { path: '', component: Page },
      ]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await TestBed.inject(ApplicationRef).whenStable();
    return { router, location: TestBed.inject(Location) };
  }

  describe('the day', () => {
    it('is today, on the UTC clock, when the address names none', async () => {
      await open('/');

      expect(store.date()).toBe('2026-10-14');
    });

    it('is the day the address names', async () => {
      await open('/?date=2026-10-12');

      expect(store.date()).toBe('2026-10-12');
      expect(screen.getByRole('status')).toHaveTextContent('2026-10-12');
    });

    it.each(['nope', '', '2026-02-31', '12/10/2026', '2026-10-12T09:00'])(
      'is today for the unreadable %j',
      async (garbage) => {
        await open(`/?date=${encodeURIComponent(garbage)}`);

        expect(store.date()).toBe('2026-10-14');
      },
    );

    it('follows the address when it changes', async () => {
      const { router } = await open('/?date=2026-10-12');

      await router.navigateByUrl('/?date=2026-10-13');

      expect(store.date()).toBe('2026-10-13');
    });
  });

  describe('setDate', () => {
    it('puts another day into the address', async () => {
      const { location } = await open('/');

      await store.setDate('2026-10-12');

      expect(location.path()).toBe('/?date=2026-10-12');
      expect(store.date()).toBe('2026-10-12');
    });

    it('takes the parameter off for today', async () => {
      const { location } = await open('/?date=2026-10-12');

      await store.setDate('2026-10-14');

      expect(location.path()).toBe('/');
      expect(store.date()).toBe('2026-10-14');
    });

    it('takes the parameter off for no day at all', async () => {
      const { location } = await open('/?date=2026-10-12');

      await store.setDate('');

      expect(location.path()).toBe('/');
      expect(store.date()).toBe('2026-10-14');
    });

    it('does not put a day that is not one into the address', async () => {
      const { location } = await open('/?date=2026-10-12');

      await store.setDate('2026-02-31');

      expect(location.path()).toBe('/');
    });

    it('keeps the other parameters of the address', async () => {
      const { location } = await open('/?utm=a');

      await store.setDate('2026-10-12');

      expect(location.path()).toBe('/?utm=a&date=2026-10-12');
    });

    it('replaces the entry of the history: Back leaves the page, and coming back finds the day', async () => {
      const { router, location } = await open('/');
      await store.setDate('2026-10-12');
      await router.navigateByUrl('/elsewhere');

      location.back();
      await vi.waitFor(() => {
        expect(location.path()).toBe('/?date=2026-10-12');
      });
      await TestBed.inject(ApplicationRef).whenStable();

      expect(store.date()).toBe('2026-10-12');
    });
  });
});
