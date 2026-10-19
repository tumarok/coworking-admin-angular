import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { SessionStore } from '@core/auth/session-store';
import { TOKEN_KEY } from '@core/auth/session-token';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { LoginPage } from './login-page';

@Component({ template: '<h1>Landing</h1>' })
class Landing {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

const EMAIL = 'admin@coworking.test';
const PASSWORD = 'demo1234';

describe('LoginPage', () => {
  let signInRequests: number;

  beforeEach(() => {
    installMockApi();
    signInRequests = 0;
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname.endsWith('/auth/login')) signInRequests++;
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  async function open(url = '/login', state?: object) {
    const view = await render(Outlet, {
      providers: provideTestSession([
        { path: 'login', component: LoginPage },
        { path: '**', component: Landing },
      ]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url, { state });
    await view.fixture.whenStable();
    return { ...view, router };
  }

  const email = () => screen.getByRole('textbox', { name: 'Email' });
  const password = () => screen.getByLabelText(/^Password/);
  const submit = () => screen.getByRole('button', { name: /^Sign in|Signing in/ });
  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');

  async function fill(values: { email?: string; password?: string }) {
    if (values.email !== undefined) await userEvent.type(email(), values.email);
    if (values.password !== undefined) await userEvent.type(password(), values.password);
  }

  describe('the page', () => {
    it('has the page heading and the demo account hint', async () => {
      await open();

      expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByText('Demo account: admin@coworking.test / demo1234')).toBeInTheDocument();
    });

    it('puts the cursor in the email field', async () => {
      await open();

      expect(email()).toHaveFocus();
    });

    it('lets password managers fill both fields', async () => {
      await open();

      expect(email()).toHaveAttribute('autocomplete', 'username');
      expect(email()).toHaveAttribute('type', 'email');
      expect(password()).toHaveAttribute('autocomplete', 'current-password');
    });

    it('marks both fields as required for assistive technology', async () => {
      await open();

      expect(email()).toBeRequired();
      expect(password()).toBeRequired();
    });
  });

  describe('validation', () => {
    it('shows no error before a field is touched', async () => {
      await open();

      await userEvent.type(email(), 'not an email');

      expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument();
    });

    it('words the email error once the field is left, and describes the field with it', async () => {
      await open();

      await userEvent.type(email(), 'not an email');
      await userEvent.tab();

      expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
      expect(email()).toHaveAccessibleDescription('Enter a valid email');
      expect(email()).toBeInvalid();
    });

    it('words the password error once the field is left empty', async () => {
      await open();

      await userEvent.click(password());
      await userEvent.tab();

      expect(screen.getByText('Enter your password')).toBeInTheDocument();
      expect(password()).toBeInvalid();
    });

    it('takes the error away when the value is fixed', async () => {
      await open();
      await userEvent.type(email(), 'nope');
      await userEvent.tab();

      await userEvent.click(email());
      await userEvent.clear(email());
      await userEvent.type(email(), EMAIL);

      expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument();
      expect(email()).toBeValid();
    });

    it('keeps the button disabled until both fields are valid', async () => {
      await open();
      expect(submit()).toBeDisabled();

      await fill({ email: EMAIL });
      expect(submit()).toBeDisabled();

      await fill({ password: PASSWORD });
      expect(submit()).toBeEnabled();
    });

    it('shows what is wrong, and sends nothing, when Enter is pressed on an invalid form', async () => {
      await open();
      expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument();

      await userEvent.type(email(), 'nope{Enter}');

      expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
      expect(screen.getByText('Enter your password')).toBeInTheDocument();
      expect(signInRequests).toBe(0);
    });

    it('shows what is wrong, and sends nothing, when the form itself is submitted while invalid', async () => {
      const { container } = await open();
      const form = container.querySelector('form');
      if (!form) throw new Error('The page has no form');

      fireEvent.submit(form);

      expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
      expect(screen.getByText('Enter your password')).toBeInTheDocument();
      expect(signInRequests).toBe(0);
    });

    it('does not show errors when Enter is pressed on the password toggle', async () => {
      await open();
      await fill({ email: EMAIL });
      screen.getByRole('button', { name: 'Show password' }).focus();

      await userEvent.keyboard('{Enter}');

      expect(screen.queryByText('Enter your password')).not.toBeInTheDocument();
    });
  });

  describe('showing the password', () => {
    it('hides it by default and reveals it on request, keeping the button name stable', async () => {
      await open();
      await fill({ password: PASSWORD });
      const toggle = screen.getByRole('button', { name: 'Show password' });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(password()).toHaveAttribute('type', 'password');

      await userEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(password()).toHaveAttribute('type', 'text');
      expect(password()).toHaveValue(PASSWORD);

      await userEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(password()).toHaveAttribute('type', 'password');
    });

    it('is reachable by keyboard without submitting the form', async () => {
      await open();
      await fill({ email: EMAIL, password: PASSWORD });

      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus();
      await userEvent.keyboard('{Enter}');

      expect(password()).toHaveAttribute('type', 'text');
      expect(TestBed.inject(SessionStore).token()).toBeNull();
    });
  });

  describe('signing in', () => {
    it('stores the session and goes to the start page, replacing the sign-in entry', async () => {
      const { router } = await open();
      await fill({ email: EMAIL, password: PASSWORD });

      await userEvent.click(submit());

      await vi.waitFor(() => {
        expect(router.url).toBe('/');
      });
      expect(sessionStorage.getItem(TOKEN_KEY)).toBe('demo-token.usr_admin');
      expect(TestBed.inject(SessionStore).user()?.name).toBe('Alex Morgan');
      expect(await screen.findByRole('heading', { name: 'Landing' })).toBeInTheDocument();
    });

    it('submits with Enter from the password field', async () => {
      const { router } = await open();
      await fill({ email: EMAIL, password: `${PASSWORD}{Enter}` });

      await vi.waitFor(() => {
        expect(router.url).toBe('/');
      });
    });

    it('returns to the page named in the navigation state', async () => {
      const { router } = await open('/login', { from: '/bookings?page=2' });
      await fill({ email: EMAIL, password: PASSWORD });

      await userEvent.click(submit());

      await vi.waitFor(() => {
        expect(router.url).toBe('/bookings?page=2');
      });
    });

    it('returns to the page named in the query when there is no state', async () => {
      const { router } = await open('/login?from=%2Frooms%2Froom_1');
      await fill({ email: EMAIL, password: PASSWORD });

      await userEvent.click(submit());

      await vi.waitFor(() => {
        expect(router.url).toBe('/rooms/room_1');
      });
    });

    it.each(['//evil.example', 'https://evil.example'])(
      'does not follow the unsafe return address %s',
      async (from) => {
        const { router } = await open(`/login?from=${encodeURIComponent(from)}`);
        await fill({ email: EMAIL, password: PASSWORD });

        await userEvent.click(submit());

        await vi.waitFor(() => {
          expect(router.url).toBe('/');
        });
      },
    );

    it('disables the fields and the button while the request runs, and sends it once', async () => {
      let open_: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        open_ = resolve;
      });
      server.use(
        http.post(apiUrl('/auth/login'), async () => {
          await gate;
          return HttpResponse.json({ message: 'Invalid email or password' }, { status: 401 });
        }),
      );
      await open();
      await fill({ email: EMAIL, password: PASSWORD });

      await userEvent.click(submit());

      await vi.waitFor(() => {
        expect(submit()).toHaveTextContent('Signing in…');
      });
      expect(submit()).toBeDisabled();
      expect(email()).toBeDisabled();
      expect(password()).toBeDisabled();
      await userEvent.keyboard('{Enter}');
      open_();
      await screen.findByRole('alert');
      expect(signInRequests).toBe(1);
      expect(email()).toBeEnabled();
      expect(submit()).toHaveTextContent('Sign in');
    });
  });

  describe('a refused sign-in', () => {
    async function refuse() {
      const view = await open();
      await fill({ email: EMAIL, password: 'wrong-password' });
      await userEvent.click(submit());
      return view;
    }

    it('shows the reason above the fields, without a snackbar and without leaving', async () => {
      const { router } = await refuse();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Invalid email or password');
      expect(
        alert.compareDocumentPosition(email()) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(router.url).toBe('/login');
      expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(snackbars()).toHaveLength(0);
    });

    it('puts the focus back on the password, which the disabled fields had dropped', async () => {
      await refuse();
      await screen.findByRole('alert');

      await vi.waitFor(() => {
        expect(password()).toHaveFocus();
      });
    });

    it('keeps what was typed so it can be corrected', async () => {
      await refuse();
      await screen.findByRole('alert');

      expect(email()).toHaveValue(EMAIL);
      expect(password()).toHaveValue('wrong-password');
    });

    it('hides the reason with the first edit of either field', async () => {
      await refuse();
      await screen.findByRole('alert');

      await userEvent.type(password(), '1');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('can be repeated with new values', async () => {
      const { router } = await refuse();
      await screen.findByRole('alert');

      await userEvent.clear(password());
      await userEvent.type(password(), PASSWORD);
      await userEvent.click(submit());

      await vi.waitFor(() => {
        expect(router.url).toBe('/');
      });
    });

    it('shows the message of any other failure the same way', async () => {
      server.use(
        http.post(apiUrl('/auth/login'), () =>
          HttpResponse.json({ message: 'Sign-in is down for maintenance' }, { status: 503 }),
        ),
      );
      await open();
      await fill({ email: EMAIL, password: PASSWORD });

      await userEvent.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in is down for maintenance');
      expect(snackbars()).toHaveLength(0);
    });

    it('explains an unreachable server', async () => {
      server.use(http.post(apiUrl('/auth/login'), () => HttpResponse.error()));
      await open();
      await fill({ email: EMAIL, password: PASSWORD });

      await userEvent.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
    });
  });
});
