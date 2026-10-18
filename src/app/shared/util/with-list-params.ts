import { computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { signalStoreFeature, withComputed, withMethods, withProps } from '@ngrx/signals';
import {
  type FilterCodecs,
  type FilterValues,
  type ListParams,
  type ListParamsConfig,
  parseListParams,
  RESERVED_KEYS,
  serializeListParams,
} from './list-params';

/** The page and size a paginator reports. */
export interface PageChange {
  page: number;
  limit: number;
}

/**
 * The state of a list page: page, page size, search and filters, kept in the URL's query
 * parameters and nowhere else.
 *
 * `params` is computed from the URL, and every method only navigates, so the flow runs one way
 * (URL -> `params` -> request) and cannot loop. A page loads its data from `params()`; the Back
 * button, a reload and a shared link all restore the same list.
 *
 * Provide the store on the page's component (`providers: [ListStore]`), not in root: it reads the
 * `ActivatedRoute` of its injector, which is the page's own route only there.
 *
 * Changing the search, a filter or the page size returns to page 1, as the old page may not exist
 * under the new conditions. Changing a value to what it already is does nothing.
 */
export function withListParams<const C extends FilterCodecs>(config: ListParamsConfig<C> = {}) {
  const reserved = Object.keys(config.filters ?? {}).filter((key) =>
    (RESERVED_KEYS as readonly string[]).includes(key),
  );
  if (reserved.length > 0) {
    throw new Error(`List filters cannot use the reserved keys: ${reserved.join(', ')}`);
  }

  return signalStoreFeature(
    withProps(() => {
      const route = inject(ActivatedRoute);
      return {
        _route: route,
        _router: inject(Router),
        _query: toSignal(route.queryParamMap, { requireSync: true }),
      };
    }),
    withComputed(({ _query }) => ({
      /** The list state in the URL. A new object is made only when a value actually changes. */
      params: computed(() => parseListParams(_query(), config), {
        equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      }),
    })),
    withComputed(({ params }) => ({
      /** Whether a search or a filter narrows the list; the page size does not count. */
      hasActiveFilters: computed(() => {
        const { page: _page, limit: _limit, ...narrowing } = params();
        return Object.values(narrowing).some((value) => value !== undefined && value !== '');
      }),
    })),
    withMethods(({ _route, _router, params }) => {
      // The state last asked for while its navigation is still under way. `params()` follows the
      // URL, which changes only when the navigation ends, so a second call made before that would
      // build on the old state and undo the first. Cleared once the navigation settles.
      let requested: ListParams<C> | undefined;
      const latest = () => requested ?? params();

      /** The state as the URL will read it back: trimmed, defaults applied, invalid values gone. */
      const normalize = (state: ListParams<C>): ListParams<C> => {
        const written = serializeListParams(state, config);
        return parseListParams({ get: (name) => (written[name] as string | null) ?? null }, config);
      };

      const patch = (changes: Partial<ListParams<C>>): Promise<boolean> => {
        const current = latest() as Record<string, unknown>;
        const entries = Object.entries(changes);
        if (entries.every(([key, value]) => Object.is(current[key], value))) {
          return Promise.resolve(false);
        }

        // Only a deliberate page change keeps the page.
        const next = normalize({
          ...current,
          ...changes,
          ...('page' in changes ? {} : { page: 1 }),
        } as ListParams<C>);
        requested = next;
        const settle = () => {
          if (requested === next) requested = undefined;
        };
        return _router
          .navigate([], {
            relativeTo: _route,
            queryParams: serializeListParams(next, config),
            queryParamsHandling: 'merge',
            replaceUrl: true,
          })
          .finally(settle);
      };

      return {
        /** Applies several changes in one navigation. */
        patch,
        setPage: (page: number) => patch({ page } as Partial<ListParams<C>>),
        setLimit: (limit: number) => patch({ limit } as Partial<ListParams<C>>),
        setSearch: (q: string) => patch({ q: q.trim() } as Partial<ListParams<C>>),
        setFilter: <K extends keyof C>(key: K, value: FilterValues<C>[K] | undefined) =>
          patch({ [key]: value } as Partial<ListParams<C>>),
        /** Takes what `mat-paginator` reports: a new page size starts again from page 1. */
        paginate: ({ page, limit }: PageChange) =>
          limit === latest().limit
            ? patch({ page } as Partial<ListParams<C>>)
            : patch({ limit } as Partial<ListParams<C>>),
        /** Clears the search and every filter, but keeps the page size. */
        reset: () => {
          const cleared: Record<string, unknown> = { q: '' };
          for (const key of Object.keys(config.filters ?? {})) cleared[key] = undefined;
          return patch(cleared as Partial<ListParams<C>>);
        },
      };
    }),
  );
}
