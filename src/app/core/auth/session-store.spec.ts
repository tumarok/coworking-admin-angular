import { HttpErrorResponse } from '@angular/common/http';
import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CacheStore } from '@core/api/cache-store';
import { Notifier } from '@core/notifications/notifier';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { SESSION_EXPIRED_MESSAGE, SessionStore } from './session-store';
import { TOKEN_KEY } from './session-token';

@Component({ template: '' })
class Blank {}

const ROUTES = [{ path: '**', component: Blank }];
const ADMIN = { email: 'admin@coworking.test', password: 'demo1234' };

describe('SessionStore', () => {
  let meRequests: number;

  beforeEach(() => {
    installMockApi();
    meRequests = 0;
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname.endsWith('/auth/me')) meRequests++;
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
    vi.restoreAllMocks();
  });

  function create() {
    TestBed.configureTestingModule({ providers: provideTestSession(ROUTES) });
    return TestBed.inject(SessionStore);
  }

  /** What the session tells the user, without the snackbar machinery. */
  const notices = () => vi.spyOn(TestBed.inject(Notifier), 'error').mockResolvedValue();

  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');

  describe('creation', () => {
    it('reads the stored token at once, so the first navigation already sees it', () => {
      signIn();

      const session = create();

      expect(session.token()).toBe('demo-token.usr_admin');
      expect(session.isAuthenticated()).toBe(true);
      expect(session.user()).toBeNull();
      expect(meRequests).toBe(0);
    });

    it('starts signed out without a token', () => {
      const session = create();

      expect(session.token()).toBeNull();
      expect(session.isAuthenticated()).toBe(false);
    });
  });

  describe('login', () => {
    it('stores the token and the user', async () => {
      const session = create();

      await session.login(ADMIN);

      expect(session.token()).toBe('demo-token.usr_admin');
      expect(session.user()).toMatchObject({ name: 'Alex Morgan', role: 'admin' });
      expect(session.isAuthenticated()).toBe(true);
      expect(sessionStorage.getItem(TOKEN_KEY)).toBe('demo-token.usr_admin');
    });

    it('starts from an empty cache', async () => {
      const session = create();
      const clear = vi.spyOn(TestBed.inject(CacheStore), 'clear');

      await session.login(ADMIN);

      expect(clear).toHaveBeenCalledOnce();
    });

    it('keeps the session in memory when storage refuses the token', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      const session = create();

      await session.login(ADMIN);

      expect(session.token()).toBe('demo-token.usr_admin');
      expect(session.user()?.name).toBe('Alex Morgan');
      expect(session.isAuthenticated()).toBe(true);
    });

    it('is pending while the request runs', async () => {
      const session = create();

      const login = session.login(ADMIN);
      expect(session.loginPending()).toBe(true);

      await login;
      expect(session.loginPending()).toBe(false);
    });

    it('rejects with the response when the credentials are wrong, leaving no session and no snackbar', async () => {
      const session = create();
      const notice = notices();

      const failure = await session.login({ ...ADMIN, password: 'wrong' }).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(HttpErrorResponse);
      expect((failure as HttpErrorResponse).status).toBe(401);
      expect(session.token()).toBeNull();
      expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(notice).not.toHaveBeenCalled();
    });

    it('does not clear the cache when the sign-in is refused', async () => {
      const session = create();
      const clear = vi.spyOn(TestBed.inject(CacheStore), 'clear');

      await session.login({ ...ADMIN, password: 'wrong' }).catch(() => undefined);

      expect(clear).not.toHaveBeenCalled();
    });
  });

  describe('loadUser', () => {
    it('fetches the user for a token that has none', async () => {
      signIn();
      const session = create();

      await session.loadUser();

      expect(session.user()).toMatchObject({ name: 'Alex Morgan', email: 'admin@coworking.test' });
      expect(session.checking()).toBe(false);
    });

    it('is checking while the answer is on its way', async () => {
      signIn();
      const session = create();

      const loading = session.loadUser();
      expect(session.checking()).toBe(true);

      await loading;
      expect(session.checking()).toBe(false);
    });

    it('sends one request for callers that arrive together', async () => {
      signIn();
      const session = create();

      await Promise.all([session.loadUser(), session.loadUser()]);

      expect(meRequests).toBe(1);
    });

    it('asks again only while there is still no user', async () => {
      signIn();
      const session = create();
      await session.loadUser();

      await session.loadUser();

      expect(meRequests).toBe(1);
    });

    it('does nothing without a token', async () => {
      const session = create();

      await session.loadUser();

      expect(meRequests).toBe(0);
      expect(session.checking()).toBe(false);
    });

    it('does nothing after a sign-in, which already brought the user', async () => {
      const session = create();
      await session.login(ADMIN);

      await session.loadUser();

      expect(meRequests).toBe(0);
    });

    it('keeps the token and the visitor in when the API fails for another reason', async () => {
      server.use(
        http.get(apiUrl('/auth/me'), () => HttpResponse.json({ message: 'Boom' }, { status: 500 })),
      );
      signIn();
      const session = create();

      await session.loadUser();

      expect(session.token()).toBe('demo-token.usr_admin');
      expect(session.user()).toBeNull();
      expect(session.checking()).toBe(false);
    });

    it('ends the session when the token is rejected', async () => {
      sessionStorage.setItem(TOKEN_KEY, 'demo-token.nobody');
      const session = create();

      await session.loadUser();

      expect(session.token()).toBeNull();
      expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(session.checking()).toBe(false);
    });

    it('drops an answer that arrives after the session ended', async () => {
      let answer: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        answer = resolve;
      });
      server.use(
        http.get(apiUrl('/auth/me'), async () => {
          await gate;
          return HttpResponse.json({
            id: 'usr_admin',
            name: 'Alex Morgan',
            email: 'admin@coworking.test',
            role: 'admin',
          });
        }),
      );
      signIn();
      const session = create();
      const loading = session.loadUser();

      await session.logout();
      answer();
      await loading;

      expect(session.user()).toBeNull();
      expect(session.token()).toBeNull();
    });
  });

  describe('logout', () => {
    it('forgets the session and the cached data, then shows the sign-in page', async () => {
      const session = create();
      await session.login(ADMIN);
      const notice = notices();
      const clear = vi.spyOn(TestBed.inject(CacheStore), 'clear');
      await TestBed.inject(Router).navigateByUrl('/rooms');

      await session.logout();

      expect(session.token()).toBeNull();
      expect(session.user()).toBeNull();
      expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(clear).toHaveBeenCalledOnce();
      expect(TestBed.inject(Router).url).toBe('/login');
      expect(notice).not.toHaveBeenCalled();
    });
  });

  describe('expire', () => {
    const TOKEN = 'demo-token.usr_admin';

    it('ends the session, tells the user once and goes to sign in, keeping the page', async () => {
      signIn();
      const session = create();
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/bookings?page=2');
      const clear = vi.spyOn(TestBed.inject(CacheStore), 'clear');

      session.expire(TOKEN);
      session.expire(TOKEN);
      session.expire(TOKEN);

      expect(session.token()).toBeNull();
      expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent(SESSION_EXPIRED_MESSAGE);
      await vi.waitFor(() => {
        expect(router.url).toBe('/login?from=%2Fbookings%3Fpage%3D2');
      });
      expect(clear).not.toHaveBeenCalled();
    });

    it('does nothing when nobody is signed in', async () => {
      const session = create();
      const notice = notices();
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/rooms');

      session.expire(TOKEN);

      expect(notice).not.toHaveBeenCalled();
      expect(router.url).toBe('/rooms');
    });

    it('ignores a rejection that arrives after a sign-out', async () => {
      signIn();
      const session = create();
      const notice = notices();
      await session.logout();

      session.expire(TOKEN);

      expect(notice).not.toHaveBeenCalled();
      expect(TestBed.inject(Router).url).toBe('/login');
    });

    it.each([
      ['the token of an earlier session', 'demo-token.usr_manager'],
      ['a request that carried no token', null],
    ])('ignores a rejection for %s: the current session is fine', async (_label, sent) => {
      signIn();
      const session = create();
      const notice = notices();
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/rooms');

      session.expire(sent);

      expect(session.token()).toBe(TOKEN);
      expect(sessionStorage.getItem(TOKEN_KEY)).toBe(TOKEN);
      expect(notice).not.toHaveBeenCalled();
      expect(router.url).toBe('/rooms');
    });
  });
});
