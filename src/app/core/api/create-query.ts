import { HttpContext, httpResource } from '@angular/common/http';
import { computed, inject, Injector, signal, type Signal } from '@angular/core';
import { API_ENDPOINT } from '@core/http/api-url';
import { type ApiError, parseApiError } from '@shared/api/api-error';
import { BYPASS_CACHE, CACHE_TAGS } from './cache-context';
import { type QueryParams, serializeParams } from './serialize-params';
import { TagRegistry } from './tag-registry';
import type { Tag } from './tags';

export interface QueryRequest {
  /** Endpoint path, relative to the API base URL: `/rooms`. */
  url: string;
  params?: QueryParams | null;
}

export interface QueryOptions<T> {
  /** The request to send. Reading signals here makes the query follow them; `undefined` skips it. */
  request: () => QueryRequest | undefined;
  /**
   * The tags this query shows. Derive them from the request's inputs, not from the response:
   * tags that change when the data arrives would send the query off again. A query with nothing
   * worth invalidating returns an empty list.
   */
  tags: () => readonly Tag[];
  /** Validates or converts the raw body, usually `parseResponse(schema, label)`. */
  parse?: (raw: unknown) => T;
  /** Required when the query is created outside an injection context. */
  injector?: Injector;
}

export interface QueryRef<T> {
  /**
   * The last result that arrived. Unlike a bare `httpResource` it is kept while the same
   * endpoint loads again with other params, a refresh or an invalidation, so a table does not flash
   * empty on every change. Another endpoint (a different record's URL) never shows the previous
   * one's data: `undefined` until its own result arrives, if it ever does, and while the request
   * is skipped.
   */
  readonly value: Signal<T | undefined>;
  /** Nothing to show yet: a request is running and no result has arrived. */
  readonly isLoading: Signal<boolean>;
  /** A request is running, whether or not there is something to show already. */
  readonly isFetching: Signal<boolean>;
  /** The reason the latest request failed; clears when the next one starts. */
  readonly error: Signal<ApiError | undefined>;
  /** Asks the server again, ignoring the cache. */
  refresh(): void;
}

/**
 * A GET that keeps itself up to date. It runs again when its request signals change or when one
 * of its tags is invalidated, and the HTTP cache answers repeated requests for the same URL.
 */
export function createQuery<T>(options: QueryOptions<T>): QueryRef<T> {
  const injector = options.injector ?? inject(Injector);
  const registry = injector.get(TagRegistry);

  const refreshes = signal(0);
  const last = signal<{ value: T; url: string } | undefined>(undefined);

  // Compared by value: a new but equal params object, or the invalidation of an unrelated tag,
  // must not send the request again.
  const target = computed(
    () => {
      const request = options.request();
      if (!request) return undefined;
      const tags = options.tags();
      return {
        url: request.url,
        params: serializeParams(request.params),
        tags,
        versions: registry.versionsOf(tags),
        refreshes: refreshes(),
      };
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  // Each refresh bypasses the cache exactly once: the request after it, whatever triggers that.
  let bypassed = 0;
  // The endpoint of the request in flight. An answer always belongs to the latest request, because
  // the resource cancels the one before when the request changes.
  let requestedUrl = '';
  const resource = httpResource(
    () => {
      const current = target();
      if (!current) return undefined;

      requestedUrl = current.url;
      const context = new HttpContext().set(API_ENDPOINT, true).set(CACHE_TAGS, current.tags);
      if (current.refreshes !== bypassed) {
        bypassed = current.refreshes;
        context.set(BYPASS_CACHE, true);
      }
      return { url: current.url, params: current.params, context };
    },
    {
      // The resource drops its own value when the request changes, so the result is kept here.
      parse: (raw: unknown) => {
        const value = options.parse ? options.parse(raw) : (raw as T);
        last.set({ value, url: requestedUrl });
        return value;
      },
      injector,
    },
  );

  const value = computed(() => {
    const kept = last();
    return kept && kept.url === target()?.url ? kept.value : undefined;
  });
  const isFetching = computed(() => resource.isLoading());

  return {
    value,
    isFetching,
    isLoading: computed(() => isFetching() && value() === undefined),
    error: computed(() => {
      const error: unknown = resource.error();
      return error ? parseApiError(error) : undefined;
    }),
    refresh: () => {
      refreshes.update((n) => n + 1);
    },
  };
}
