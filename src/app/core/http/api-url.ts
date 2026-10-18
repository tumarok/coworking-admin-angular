import { HttpContextToken } from '@angular/common/http';
import { InjectionToken } from '@angular/core';

/**
 * Where the API lives. Code refers to endpoints by path (`/rooms`) and the base is added on the
 * way out, so moving the API means changing this one value. Specs override it with an absolute URL
 * because Node's `fetch` rejects relative ones.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  factory: () => '/api/v1',
});

/**
 * Marks a request whose URL is an endpoint path to resolve against {@link API_BASE_URL}. The data
 * layer sets it; a plain `HttpClient` call to `/assets/logo.svg` is not an endpoint and stays as is.
 */
export const API_ENDPOINT = new HttpContextToken<boolean>(() => false);

/** The sign-in endpoint: its 401 means "wrong credentials", not "session expired". */
const LOGIN_PATH = '/auth/login';

/** `prefix` as a whole path segment: `/api/v1` matches `/api/v1/x` and `/api/v1?q=1`, not `/api/v10`. */
const startsWithPath = (url: string, prefix: string) =>
  url.startsWith(prefix) &&
  (url.length === prefix.length || '/?#'.includes(url.charAt(prefix.length)));

/**
 * Only API traffic gets a token, caching and error handling. Anything else (static assets, third
 * party hosts) passes through untouched.
 */
export const isApiUrl = (url: string, baseUrl: string) => startsWithPath(url, baseUrl);

export const isLoginUrl = (url: string, baseUrl: string) =>
  startsWithPath(url, baseUrl + LOGIN_PATH);

/**
 * Endpoints are written as paths starting with a single slash. A path that already carries the base
 * (or a full URL) is left alone.
 */
export const toApiUrl = (url: string, baseUrl: string) =>
  url.startsWith('/') && !url.startsWith('//') && !isApiUrl(url, baseUrl) ? baseUrl + url : url;
