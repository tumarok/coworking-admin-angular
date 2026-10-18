import { type HttpEvent, HttpResponse } from '@angular/common/http';
import { inject, Injectable, untracked } from '@angular/core';
import { finalize, type Observable, share, tap } from 'rxjs';
import { TagRegistry } from './tag-registry';
import { type Tag, tagKey } from './tags';

/** How long a response is reused. Long enough to make going back to a page free, short enough to heal drift. */
export const CACHE_TTL_MS = 60_000;

const sameTags = (a: readonly Tag[], b: readonly Tag[]) =>
  a.length === b.length && a.every((tag, index) => tagKey(tag) === tagKey(b[index]));

interface Versioned {
  readonly tags: readonly Tag[];
  /** Tag versions at the moment the request started. */
  readonly versions: readonly number[];
}

interface Entry extends Versioned {
  readonly response: HttpResponse<unknown>;
  readonly storedAt: number;
}

interface Pending extends Versioned {
  readonly events: Observable<HttpEvent<unknown>>;
}

/**
 * In-memory store for GET responses, keyed by URL. A response is reused while it is younger than
 * {@link CACHE_TTL_MS} and none of its tags was invalidated since the request started. Identical
 * requests in flight share one network call.
 */
@Injectable({ providedIn: 'root' })
export class CacheStore {
  private readonly registry = inject(TagRegistry);
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Pending>();
  /** Bumped by {@link clear}, so a response that arrives after it is not stored. */
  private epoch = 0;

  get size(): number {
    return this.entries.size;
  }

  /**
   * A stored response for the same request that is young enough and none of whose tags was
   * invalidated, if any. A query with the same URL but other tags gets none: it would not hear
   * about invalidations of its own tags.
   */
  fresh(key: string, tags: readonly Tag[]): HttpResponse<unknown> | undefined {
    const entry = this.entries.get(key);
    if (!entry || !sameTags(entry.tags, tags)) return undefined;
    if (this.isUsable(entry)) return entry.response;
    this.entries.delete(key);
    return undefined;
  }

  /** A request for the same data that is already on its way, if any. */
  inFlight(key: string, tags: readonly Tag[]): Observable<HttpEvent<unknown>> | undefined {
    const pending = this.pending.get(key);
    return pending && sameTags(pending.tags, tags) && this.isCurrent(pending)
      ? pending.events
      : undefined;
  }

  /**
   * Runs a request and stores its response. The result can be subscribed to by several callers;
   * the request is cancelled when the last of them unsubscribes.
   */
  track(
    key: string,
    tags: readonly Tag[],
    request: Observable<HttpEvent<unknown>>,
  ): Observable<HttpEvent<unknown>> {
    const versions = this.currentVersions(tags);
    const epoch = this.epoch;

    const events = request.pipe(
      tap((event) => {
        if (event instanceof HttpResponse && epoch === this.epoch) {
          this.prune();
          this.entries.set(key, { response: event, storedAt: Date.now(), tags, versions });
        }
      }),
      finalize(() => {
        if (this.pending.get(key)?.events === events) this.pending.delete(key);
      }),
      share(),
    );
    this.pending.set(key, { tags, versions, events });
    return events;
  }

  /** Forgets everything, for a sign-out: the next user must not see the previous one's data. */
  clear(): void {
    this.epoch++;
    this.entries.clear();
    this.pending.clear();
  }

  private isCurrent(item: Versioned): boolean {
    const current = this.currentVersions(item.tags);
    return current.every((version, index) => version === item.versions[index]);
  }

  /** Interceptors may run while an effect is tracking; the cache must not become its dependency. */
  private currentVersions(tags: readonly Tag[]): number[] {
    return untracked(() => this.registry.versionsOf(tags));
  }

  private isUsable(entry: Entry): boolean {
    return Date.now() - entry.storedAt < CACHE_TTL_MS && this.isCurrent(entry);
  }

  /** Expired and invalidated entries would otherwise stay until their key is requested again. */
  private prune(): void {
    for (const [key, entry] of this.entries) {
      if (!this.isUsable(entry)) this.entries.delete(key);
    }
  }
}
