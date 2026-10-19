import { OverlayContainer } from '@angular/cdk/overlay';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy } from '@angular/router';
import { CacheStore } from '@core/api/cache-store';
import { SessionStore } from '@core/auth/session-store';
import { TOKEN_KEY } from '@core/auth/session-token';
import { PageTitleStrategy } from '@core/layout/page-title-strategy';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { firstValueFrom } from 'rxjs';
import { App } from './app';
import { routes } from './app.routes';

/** Sign-in, the guards and the shell working together: the real routes against the mock API. */
describe('signing in and out of the app', () => {
  beforeEach(() => {
    installMockApi();
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  async function open(url: string, { wait = true } = {}) {
    const view = await render(App, {
      providers: [
        ...provideTestSession(routes),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
      ],
    });
    const router = TestBed.inject(Router);
    const navigation = router.navigateByUrl(url);
    if (wait) await navigation;
    return { ...view, router, navigation };
  }

  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');

  async function signInAs(email: string, password: string) {
    await userEvent.type(await screen.findByRole('textbox', { name: 'Email' }), email);
    await userEvent.type(screen.getByLabelText(/^Password/), password);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  }

  it('sends a visitor who is not signed in from any page to the sign-in page, without the shell', async () => {
    const { router } = await open('/rooms?page=2');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.url).toBe('/login?from=%2Frooms%3Fpage%3D2');
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(document.title).toBe('Sign in · Coworking Admin');
  });

  it('does not show the not-found page to a visitor who is not signed in', async () => {
    const { router } = await open('/no/such/page');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.url).toBe('/login?from=%2Fno%2Fsuch%2Fpage');
  });

  it('brings the visitor back to the page they asked for after signing in', async () => {
    const { router } = await open('/rooms?page=2');

    await signInAs('admin@coworking.test', 'demo1234');

    await vi.waitFor(() => {
      expect(router.url).toBe('/rooms?page=2');
    });
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('demo-token.usr_admin');
  });

  it('starts at the root when nothing was asked for', async () => {
    const { router } = await open('/login');

    await signInAs('manager@coworking.test', 'demo1234');

    await vi.waitFor(() => {
      expect(router.url).toBe('/');
    });
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('keeps a signed-in visitor off the sign-in page', async () => {
    signIn();

    const { router } = await open('/login');

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(router.url).toBe('/');
  });

  describe('after a reload', () => {
    it('says it is checking the session until the API answers, then shows the page', async () => {
      let answer: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        answer = resolve;
      });
      server.use(
        http.get(apiUrl('/auth/me'), async () => {
          await gate;
          return HttpResponse.json({
            id: 'usr_manager',
            name: 'Sam Rivera',
            email: 'manager@coworking.test',
            role: 'manager',
          });
        }),
      );
      signIn();

      const { router, navigation } = await open('/rooms', { wait: false });

      expect(await screen.findByText('Checking your session…')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Checking your session…');
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();

      answer();
      await navigation;

      expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
      expect(screen.queryByText('Checking your session…')).not.toBeInTheDocument();
      expect(router.url).toBe('/rooms');
      await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
      expect(await screen.findByRole('menu')).toHaveTextContent('Sam Rivera');
    });

    it('asks the API for the user once', async () => {
      let asked = 0;
      server.events.on('request:start', ({ request }) => {
        if (new URL(request.url).pathname.endsWith('/auth/me')) asked++;
      });
      signIn();

      await open('/rooms');
      await screen.findByRole('navigation', { name: 'Main' });
      await TestBed.inject(Router).navigateByUrl('/members');

      expect(asked).toBe(1);
    });
  });

  describe('when the session expires', () => {
    const requestLocations = () =>
      firstValueFrom(TestBed.inject(HttpClient).get(apiUrl('/locations'))).catch(() => undefined);

    beforeEach(() => {
      server.use(
        http.get(apiUrl('/locations'), () =>
          HttpResponse.json({ message: 'Authentication required' }, { status: 401 }),
        ),
      );
    });

    it('signs the visitor out once however many requests fail, and returns to the page afterwards', async () => {
      signIn();
      const { router } = await open('/rooms?page=2');
      await screen.findByRole('navigation', { name: 'Main' });
      const clear = vi.spyOn(TestBed.inject(CacheStore), 'clear');

      await Promise.all([requestLocations(), requestLocations(), requestLocations()]);

      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      expect(router.url).toBe('/login?from=%2Frooms%3Fpage%3D2');
      expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Your session has expired');
      expect(clear).not.toHaveBeenCalled();

      server.resetHandlers();
      installMockApi();
      await signInAs('admin@coworking.test', 'demo1234');
      await vi.waitFor(() => {
        expect(router.url).toBe('/rooms?page=2');
      });
    });
  });

  describe('signing out', () => {
    it('forgets the session and the cached data, and shows the sign-in page without the shell', async () => {
      signIn();
      const { router } = await open('/rooms');
      await screen.findByRole('navigation', { name: 'Main' });
      const clear = vi.spyOn(TestBed.inject(CacheStore), 'clear');

      await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      expect(router.url).toBe('/login');
      expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(TestBed.inject(SessionStore).user()).toBeNull();
      expect(clear).toHaveBeenCalledOnce();
      expect(snackbars()).toHaveLength(0);
      expect(within(document.body).queryByRole('banner')).not.toBeInTheDocument();
    });

    it('asks to sign in again for any guarded page afterwards', async () => {
      signIn();
      const { router } = await open('/rooms');
      await screen.findByRole('navigation', { name: 'Main' });
      await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
      await screen.findByRole('heading', { name: 'Sign in' });

      await router.navigateByUrl('/members');

      expect(router.url).toBe('/login?from=%2Fmembers');
    });
  });
});
