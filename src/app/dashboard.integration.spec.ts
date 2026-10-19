import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy } from '@angular/router';
import { PageTitleStrategy } from '@core/layout/page-title-strategy';
import { formatMoney } from '@shared/util/format';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn, TEST_NOW } from '@testing/mock-api';
import { provideTestSession } from '@testing/test-providers';
import { App } from './app';
import { routes } from './app.routes';

/** The dashboard inside the real application: guard, shell, lazy routes, titles and fresh data. */
describe('the dashboard of the app', () => {
  let api: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TEST_NOW);
    api = installMockApi();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function open(url: string) {
    const view = await render(App, {
      providers: [
        ...provideTestSession(routes),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await view.fixture.whenStable();
    return { ...view, router };
  }

  const navLink = (name: string) =>
    within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name });
  const revenue = () =>
    within(screen.getByRole('region', { name: 'Key figures' })).getByText('Revenue in October 2026')
      .nextElementSibling as HTMLElement;

  it('sends a visitor who is not signed in to the sign-in page', async () => {
    const { router } = await open('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.url).toBe('/login');
  });

  it('shows the dashboard at the root, in the shell, with its navigation entry current and the tab named', async () => {
    signIn();

    await open('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Key figures' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
    expect(navLink('Dashboard')).toHaveClass('active');
    expect(navLink('Locations')).not.toHaveClass('active');
    expect(document.title).toBe('Dashboard · Coworking Admin');
  });

  it('keeps its navigation entry current for another day, which the address names', async () => {
    signIn();

    await open('/?date=2026-10-12');

    expect(await screen.findByText('Across all locations on 12 Oct 2026')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Key figures' })).toBeInTheDocument();
    expect(navLink('Dashboard')).toHaveClass('active');
  });

  it('still shows the not-found page for an address that no route knows', async () => {
    signIn();

    await open('/nowhere');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });

  it('goes to the bookings from "All bookings" and back to the dashboard from the navigation', async () => {
    signIn();
    const { router } = await open('/');

    await userEvent.click(await screen.findByRole('link', { name: 'All bookings' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Bookings' })).toBeInTheDocument();
    expect(router.url).toBe('/bookings');
    expect(navLink('Bookings')).toHaveClass('active');

    await userEvent.click(navLink('Dashboard'));

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(router.url).toBe('/');
  });

  it('shows the effect of a booking changed elsewhere when the person comes back', async () => {
    signIn();
    const pending = api.db.bookings.find(
      (b) =>
        b.status === 'pending' &&
        b.startsAt.startsWith('2026-10') &&
        Date.parse(b.startsAt) > TEST_NOW &&
        b.totalPrice > 0,
    );
    if (!pending) throw new Error('seed has no pending booking this month');
    await open('/');
    await screen.findByRole('region', { name: 'Key figures' });
    const before = revenue().textContent;

    // Confirming a booking counts its price in the month, and the dashboard was cached.
    await userEvent.click(navLink('Bookings'));
    await screen.findByRole('heading', { level: 1, name: 'Bookings' });
    await TestBed.inject(Router).navigateByUrl(`/bookings/${pending.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    });
    await userEvent.click(navLink('Dashboard'));

    await vi.waitFor(() => {
      expect(revenue()).not.toHaveTextContent(before);
    });
    const after = api.db.bookings
      .filter(
        (b) =>
          b.startsAt.startsWith('2026-10') &&
          ['confirmed', 'checked_in', 'completed'].includes(b.status),
      )
      .reduce((sum, b) => sum + b.totalPrice, 0);
    expect(revenue()).toHaveTextContent(formatMoney(after));
  });
});
