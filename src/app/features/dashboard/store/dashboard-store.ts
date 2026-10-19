import { computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { signalStore, withComputed, withMethods, withProps } from '@ngrx/signals';
import { dateFilter } from '@shared/util/list-params';

/** Today's date, `YYYY-MM-DD`, on the UTC clock the API counts days by. */
const todayUtc = (): string => new Date().toISOString().slice(0, 10);

/**
 * The day the dashboard shows, kept in the URL (`?date=2026-10-14`) and nowhere else. Today is no
 * parameter at all, so the plain `/` is always the current day; an unreadable `date` falls back to
 * it. Provide it on the page (`providers: [DashboardStore]`), not in root, so it reads the page's
 * own route.
 */
export const DashboardStore = signalStore(
  withProps(() => {
    const route = inject(ActivatedRoute);
    return {
      _route: route,
      _router: inject(Router),
      _query: toSignal(route.queryParamMap, { requireSync: true }),
    };
  }),
  withComputed(({ _query }) => ({
    /** `YYYY-MM-DD`, in UTC. */
    date: computed(() => {
      const raw = _query().get('date');
      return (raw === null ? undefined : dateFilter.parse(raw)) ?? todayUtc();
    }),
  })),
  withMethods(({ _route, _router }) => ({
    /** Shows another day. Today, and `''` (no day), take the parameter off the address. */
    setDate: (date: string): Promise<boolean> =>
      _router.navigate([], {
        relativeTo: _route,
        queryParams: {
          date: dateFilter.format(date) === date && date !== todayUtc() ? date : null,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }),
  })),
);
