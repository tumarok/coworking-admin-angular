import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy } from '@angular/router';
import { PageTitleStrategy } from '@core/layout/page-title-strategy';
import { formatTimeRange } from '@shared/util/format';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { provideTestSession } from '@testing/test-providers';
import { App } from './app';
import { routes } from './app.routes';

/** The bookings section inside the real application: guard, shell, lazy routes and titles. */
describe('the bookings section of the app', () => {
  let api: ReturnType<typeof installMockApi>;

  // The list's result dialog is a lazy chunk; fetching it here keeps that cost out of the test.
  beforeAll(async () => {
    await import('./features/bookings/dialogs/bulk-result-dialog');
  });

  beforeEach(() => {
    api = installMockApi();
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

  const navLink = () =>
    within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
      name: 'Bookings',
    });
  const first = () => {
    const booking = [...api.db.bookings].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
    const room = api.db.rooms.find((r) => r.id === booking.roomId);
    const location = api.db.locations.find((l) => l.id === room?.locationId);
    return { booking, room, location };
  };

  it('sends a visitor who is not signed in to the sign-in page, remembering the page', async () => {
    const { router } = await open('/bookings/bk_x');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.url).toBe('/login?from=%2Fbookings%2Fbk_x');
  });

  it('shows the list in the shell, with its navigation entry current and the tab named', async () => {
    signIn();

    await open('/bookings');

    expect(await screen.findByRole('heading', { level: 1, name: 'Bookings' })).toBeInTheDocument();
    expect(
      await screen.findAllByRole('link', { name: /\d{2} \w{3} 20\d\d, \d\d:\d\d–/ }),
    ).not.toHaveLength(0);
    expect(navLink()).toHaveClass('active');
    expect(document.title).toBe('Bookings · Coworking Admin');
  });

  it('goes from the list to a booking and back, keeping the navigation entry current', async () => {
    signIn();
    const { router } = await open('/bookings');
    const { booking, room, location } = first();
    const when = formatTimeRange(booking.startsAt, booking.endsAt, location?.timezone);

    await userEvent.click(await screen.findByRole('link', { name: when }));

    expect(
      await screen.findByRole('heading', { level: 1, name: `${room?.name}, ${when}` }),
    ).toBeInTheDocument();
    expect(router.url).toBe(`/bookings/${booking.id}`);
    expect(document.title).toBe('Booking · Coworking Admin');
    expect(navLink()).toHaveClass('active');

    await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Bookings' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Bookings' })).toBeInTheDocument();
    expect(router.url).toBe('/bookings');
  });

  it('opens the bookings of a member from the member’s page, with the member shown as the filter', async () => {
    signIn();
    const { booking } = first();
    const member = api.db.members.find((m) => m.id === booking.memberId);
    const { router } = await open(`/members/${booking.memberId}`);

    await userEvent.click(await screen.findByRole('link', { name: 'View bookings' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Bookings' })).toBeInTheDocument();
    expect(router.url).toBe(`/bookings?memberId=${booking.memberId}`);
    expect(
      await screen.findByText(`Member: ${member?.firstName} ${member?.lastName}`),
    ).toBeInTheDocument();
    await vi.waitFor(() => {
      const shown = screen.getAllByRole('row').length - 1;
      expect(shown).toBe(
        Math.min(20, api.db.bookings.filter((b) => b.memberId === booking.memberId).length),
      );
    });
  });

  it('shows the not-found page of the booking, inside the shell, for an id nobody has', async () => {
    signIn();

    await open('/bookings/bk_nope');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Booking not found' }),
    ).toBeInTheDocument();
    expect(navLink()).toHaveClass('active');
  });

  it('shows the not-found page for an address below a booking that no route knows', async () => {
    signIn();

    await open('/bookings/bk_x/extra');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });

  it('confirms selected bookings in one request from the list, and tells which could not be', async () => {
    signIn();
    const [pending, done] = [...api.db.bookings].sort((a, b) =>
      b.startsAt.localeCompare(a.startsAt),
    );
    pending.status = 'pending';
    done.status = 'completed';
    const label = (id: string) => {
      const booking = api.db.bookings.find((b) => b.id === id);
      const room = api.db.rooms.find((r) => r.id === booking?.roomId);
      const location = api.db.locations.find((l) => l.id === room?.locationId);
      const range = formatTimeRange(
        booking?.startsAt ?? '',
        booking?.endsAt ?? '',
        location?.timezone,
      );
      return `${room?.name}, ${range}`;
    };
    const { router } = await open('/bookings');

    await userEvent.click(
      await screen.findByRole('checkbox', { name: `Select ${label(pending.id)}` }),
    );
    await userEvent.click(screen.getByRole('checkbox', { name: `Select ${label(done.id)}` }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm selected bookings' }));

    expect(await screen.findByText('1 booking confirmed')).toBeInTheDocument();
    const dialog = await screen.findByRole('dialog', { name: 'Some bookings were not confirmed' });
    expect(dialog).toHaveTextContent('Cannot confirm a booking that is completed');
    expect(pending.status).toBe('confirmed');
    expect(screen.queryByText(/\d+ selected/)).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('link', { name: label(done.id) }));

    expect(
      await screen.findByRole('heading', { level: 1, name: label(done.id) }),
    ).toBeInTheDocument();
    expect(router.url).toBe(`/bookings/${done.id}`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
