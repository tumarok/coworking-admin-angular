import { InjectionToken } from '@angular/core';

/**
 * Supplies the bearer token for API calls, or `null` when nobody is signed in. It is read on every
 * request, so a token that changes mid-session is picked up at once. The session store backs it.
 */
export const ACCESS_TOKEN = new InjectionToken<() => string | null>('ACCESS_TOKEN', {
  factory: () => () => null,
});

/**
 * Called when the API rejects a token, with the token the failed request carried (`null` when it
 * carried none). A token rather than a direct dependency on the session store, because the store
 * sends HTTP requests itself and would otherwise depend on the interceptors that depend on it.
 * Several requests can fail together, so the hook is called once for each of them and must be
 * idempotent. A rejection of a token that is no longer the current one (an answer from before a
 * sign-out or a new sign-in) is not the current session's to act on: the hook has to ignore it.
 */
export const ON_UNAUTHORIZED = new InjectionToken<(sentToken: string | null) => void>(
  'ON_UNAUTHORIZED',
  { factory: () => () => undefined },
);
