import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, type Routes } from '@angular/router';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { authGuard, guestGuard } from './auth-guards';
import { SessionStore } from './session-store';
import { TOKEN_KEY } from './session-token';

@Component({ template: '' })
class Page {}

const ROUTES: Routes = [
  { path: 'login', canActivate: [guestGuard], component: Page },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', component: Page },
      { path: '**', component: Page },
    ],
  },
];

describe('route guards', () => {
  beforeEach(() => {
    installMockApi();
    TestBed.configureTestingModule({ providers: provideTestSession(ROUTES) });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  const router = () => TestBed.inject(Router);
  const stateOf = () => TestBed.inject(Location).getState() as Record<string, unknown> | null;

  describe('authGuard', () => {
    it('sends a visitor without a token to sign in, remembering the page in query and state', async () => {
      await router().navigateByUrl('/rooms?page=2');

      expect(router().url).toBe('/login?from=%2Frooms%3Fpage%3D2');
      expect(stateOf()).toMatchObject({ from: '/rooms?page=2' });
    });

    it('does not remember the start page', async () => {
      await router().navigateByUrl('/');

      expect(router().url).toBe('/login');
    });

    it('lets a signed-in visitor through without asking the API again', async () => {
      let asked = 0;
      server.events.on('request:start', ({ request }) => {
        if (new URL(request.url).pathname.endsWith('/auth/me')) asked++;
      });
      await TestBed.inject(SessionStore).login({
        email: 'admin@coworking.test',
        password: 'demo1234',
      });

      await router().navigateByUrl('/rooms');

      expect(router().url).toBe('/rooms');
      expect(asked).toBe(0);
    });

    it('holds the navigation until the API says who the visitor is after a reload', async () => {
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
      const session = TestBed.inject(SessionStore);

      const navigation = router().navigateByUrl('/rooms');
      await vi.waitFor(() => {
        expect(session.checking()).toBe(true);
      });
      expect(router().url).toBe('/');

      answer();
      await navigation;

      expect(router().url).toBe('/rooms');
      expect(session.user()?.name).toBe('Alex Morgan');
    });

    it('lets the visitor in when the user cannot be fetched for a reason other than the token', async () => {
      server.use(
        http.get(apiUrl('/auth/me'), () => HttpResponse.json({ message: 'Boom' }, { status: 500 })),
      );
      signIn();

      await router().navigateByUrl('/rooms');

      expect(router().url).toBe('/rooms');
      expect(TestBed.inject(SessionStore).user()).toBeNull();
    });

    it('sends the visitor to sign in when the stored token is rejected', async () => {
      sessionStorage.setItem(TOKEN_KEY, 'demo-token.nobody');

      await router().navigateByUrl('/rooms');
      await vi.waitFor(() => {
        expect(router().url).toBe('/login?from=%2Frooms');
      });

      expect(TestBed.inject(SessionStore).token()).toBeNull();
      expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    });
  });

  describe('guestGuard', () => {
    it('shows the sign-in page to a visitor without a token', async () => {
      await router().navigateByUrl('/login');

      expect(router().url).toBe('/login');
    });

    it('sends a signed-in visitor to the start page', async () => {
      signIn();

      await router().navigateByUrl('/login');

      expect(router().url).toBe('/');
    });

    it('sends a signed-in visitor to the page named in the query', async () => {
      signIn();

      await router().navigateByUrl('/login?from=%2Fbookings%3Fpage%3D2');

      expect(router().url).toBe('/bookings?page=2');
    });

    it('prefers the page named in the navigation state', async () => {
      signIn();

      await router().navigateByUrl('/login?from=%2Fmembers', { state: { from: '/rooms' } });

      expect(router().url).toBe('/rooms');
    });

    it.each(['//evil.example', 'https://evil.example', '/\\evil.example'])(
      'ignores the unsafe address %s and goes to the start page',
      async (from) => {
        signIn();

        await router().navigateByUrl(`/login?from=${encodeURIComponent(from)}`);

        expect(router().url).toBe('/');
      },
    );
  });
});
