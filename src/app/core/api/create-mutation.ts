import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, inject, Injector, signal, type Signal } from '@angular/core';
import { API_ENDPOINT } from '@core/http/api-url';
import { SILENT } from '@core/http/silent';
import { type ApiError, parseApiError } from '@shared/api/api-error';
import { firstValueFrom } from 'rxjs';
import { type QueryParams, serializeParams } from './serialize-params';
import { TagRegistry } from './tag-registry';
import type { Tag } from './tags';

export interface MutationRequest {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Endpoint path, relative to the API base URL: `/rooms/room_1`. */
  url: string;
  body?: unknown;
  params?: QueryParams | null;
  /** The caller shows the failure itself (a form), so no snackbar. */
  silent?: boolean;
}

export interface MutationOptions<A, R> {
  request: (arg: A) => MutationRequest;
  /** Validates or converts the raw body, usually `parseResponse(schema, label)`. */
  parse?: (raw: unknown) => R;
  /**
   * Tags made stale by a success, from the argument and the result. Cross-entity effects belong
   * here: see `savedTags` and `removedTags`.
   * A throw here is a bug: it rejects `run`, but `error` stays clear because the write succeeded.
   */
  invalidates?: (arg: A, result: R) => readonly Tag[];
  /** Required when the mutation is created outside an injection context. */
  injector?: Injector;
}

export interface MutationRef<A, R> {
  /** Sends the request. Rejects with the `HttpErrorResponse`; `error` holds it in parsed form. */
  run(arg: A): Promise<R>;
  /** At least one `run` is in progress. */
  readonly isPending: Signal<boolean>;
  /** The reason the latest `run` failed; clears when the next one starts. */
  readonly error: Signal<ApiError | undefined>;
}

/**
 * A write. After it succeeds, the tags it names are invalidated, which reloads the queries on
 * screen that show them. Failures invalidate nothing.
 */
export function createMutation<A, R>(options: MutationOptions<A, R>): MutationRef<A, R> {
  const injector = options.injector ?? inject(Injector);
  const http = injector.get(HttpClient);
  const registry = injector.get(TagRegistry);

  // A count rather than a flag, so overlapping runs do not end the pending state early.
  const running = signal(0);
  const error = signal<ApiError | undefined>(undefined);

  async function run(arg: A): Promise<R> {
    running.update((n) => n + 1);
    error.set(undefined);
    let result: R;
    try {
      const { method, url, body, params, silent } = options.request(arg);
      const raw = await firstValueFrom(
        http.request<unknown>(method, url, {
          body,
          params: serializeParams(params),
          context: new HttpContext().set(API_ENDPOINT, true).set(SILENT, silent === true),
        }),
      );
      result = options.parse ? options.parse(raw) : (raw as R);
    } catch (e) {
      error.set(parseApiError(e));
      throw e;
    } finally {
      running.update((n) => n - 1);
    }

    registry.invalidate(options.invalidates?.(arg, result) ?? []);
    return result;
  }

  return { run, isPending: computed(() => running() > 0), error: error.asReadonly() };
}
