import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL, isApiUrl } from '@core/http/api-url';
import { of } from 'rxjs';
import { BYPASS_CACHE, CACHE_TAGS } from './cache-context';
import { CacheStore } from './cache-store';

/**
 * Answers API GETs from {@link CacheStore} so that returning to a page does not repeat its
 * requests. A hit stops here: it never reaches the error handling below, which has nothing to
 * report for it.
 */
export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
  // Only JSON is stored: a blob or text answer to the same URL is a different thing.
  if (req.method !== 'GET' || req.responseType !== 'json') return next(req);
  if (!isApiUrl(req.url, inject(API_BASE_URL))) return next(req);

  const cache = inject(CacheStore);
  const key = req.urlWithParams;
  const tags = req.context.get(CACHE_TAGS);
  if (!req.context.get(BYPASS_CACHE)) {
    const hit = cache.fresh(key, tags);
    if (hit) return of(hit);
    const shared = cache.inFlight(key, tags);
    if (shared) return shared;
  }
  return cache.track(key, tags, next(req));
};
