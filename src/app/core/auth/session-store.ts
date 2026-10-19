import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { createMutation } from '@core/api/create-mutation';
import { CacheStore } from '@core/api/cache-store';
import { API_ENDPOINT } from '@core/http/api-url';
import { Notifier } from '@core/notifications/notifier';
import type { LoginRequest, LoginResponse, User } from '@shared/api/contract';
import { firstValueFrom } from 'rxjs';
import { loginRedirect } from './return-url';
import { readToken, writeToken } from './session-token';

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

interface SessionState {
  token: string | null;
  /** Known after a sign-in, or after `GET /auth/me` when a reload left only the token. */
  user: User | null;
  /** The user is being fetched; the app shows "Checking your session…" meanwhile. */
  checking: boolean;
}

/**
 * Who is signed in. The token is read from `sessionStorage` when the store is created, before the
 * first navigation, so the guards see a reloaded tab as signed in at once; the user follows from
 * the API (`loadUser`).
 *
 * The two responses are typed but not checked against the contract's Zod schemas, unlike the
 * data layer's: this store is part of the first load, and the schemas would more than double it.
 */
export const SessionStore = signalStore(
  { providedIn: 'root' },
  withState<SessionState>(() => ({ token: readToken(), user: null, checking: false })),
  withProps(() => ({
    _http: inject(HttpClient),
    _router: inject(Router),
    _cache: inject(CacheStore),
    _notifier: inject(Notifier),
    // Silent: the sign-in form shows its own error, a wrong password is not an app-wide failure.
    _signIn: createMutation<LoginRequest, LoginResponse>({
      request: (body) => ({ method: 'POST', url: '/auth/login', body, silent: true }),
    }),
  })),
  withComputed((store) => ({
    isAuthenticated: computed(() => store.token() !== null),
    loginPending: store._signIn.isPending,
  })),
  withMethods((store) => {
    let loading: Promise<void> | undefined;

    const endSession = () => {
      writeToken(null);
      patchState(store, { token: null, user: null, checking: false });
    };

    /** The address being opened, or the current one when nothing is on its way. */
    const wantedUrl = () => {
      const navigation = store._router.currentNavigation();
      return navigation ? store._router.serializeUrl(navigation.extractedUrl) : store._router.url;
    };

    async function fetchUser(): Promise<void> {
      const token = store.token();
      patchState(store, { checking: true });
      try {
        const user = await firstValueFrom(
          store._http.get<User>('/auth/me', { context: new HttpContext().set(API_ENDPOINT, true) }),
        );
        // The session may have ended or changed while the answer was on its way.
        if (store.token() === token) {
          patchState(store, { user });
        }
      } catch {
        // A 401 has already ended the session through `expire`. Any other failure (the network,
        // a crash) lets the visitor in: the token may well be fine, and the pages report their
        // own failures.
      } finally {
        patchState(store, { checking: false });
      }
    }

    return {
      /**
       * Rejects with the `HttpErrorResponse` when the API refuses; the form words the reason. A
       * success starts from an empty cache: the previous session may have been another user's and
       * ended by expiry, which keeps the cache.
       */
      async login(credentials: LoginRequest): Promise<void> {
        const { token, user } = await store._signIn.run(credentials);
        store._cache.clear();
        writeToken(token);
        patchState(store, { token, user });
      },

      /**
       * Fetches the user once for a token that has none (a reloaded tab). Callers that arrive
       * together share one request; with no token, or a user already known, it resolves at once.
       */
      loadUser(): Promise<void> {
        if (store.token() === null || store.user() !== null) return Promise.resolve();
        loading ??= fetchUser().finally(() => {
          loading = undefined;
        });
        return loading;
      },

      /** A deliberate sign-out: leaves nothing of the user behind, cached data included. */
      logout(): Promise<boolean> {
        endSession();
        store._cache.clear();
        return store._router.navigateByUrl('/login', { replaceUrl: true });
      },

      /**
       * The API rejected `sentToken`. The hook runs once per failed request and several can fail
       * together, so only the call that still finds that very session does anything: a rejection
       * of an earlier token (an answer that was late for a sign-out or a new sign-in) is stale.
       * The cache stays: the requests still in flight would start over and fail again; `logout`
       * is what clears it.
       */
      expire(sentToken: string | null): void {
        const current = store.token();
        if (current === null || sentToken !== current) return;
        const { tree, extras } = loginRedirect(store._router, wantedUrl());
        endSession();
        void store._notifier.error(SESSION_EXPIRED_MESSAGE);
        void store._router.navigateByUrl(tree, extras);
      },
    };
  }),
);

export type SessionStore = InstanceType<typeof SessionStore>;
