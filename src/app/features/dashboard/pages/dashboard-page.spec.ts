import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { BOOKING_STATUSES, type Dashboard } from '@shared/api/contract';
import { formatMoney, humanize } from '@shared/util/format';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn, TEST_NOW } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { delay, http, HttpResponse } from 'msw';
import { DASHBOARD_ROUTES } from '../dashboard.routes';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

describe('DashboardPage', () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: URL[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TEST_NOW);
    api = installMockApi();
    signIn();
    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/dashboard')) requests.push(url);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
    vi.useRealTimers();
  });

  /** What the mock answers for a day: the figures the page must show. */
  const expected = (date = '2026-10-14'): Dashboard => {
    const response = api.handle({
      method: 'GET',
      path: '/dashboard',
      query: { date },
      authorization: 'Bearer demo-token.usr_admin',
    });
    return response.body as Dashboard;
  };
  const answer = (body: Dashboard, { after = 0 } = {}) => {
    server.use(
      http.get(apiUrl('/dashboard'), async () => {
        if (after) await delay(after);
        return HttpResponse.json(body);
      }),
    );
  };

  async function open(url = '/', { settle = true } = {}) {
    const view = await render(Outlet, {
      providers: provideTestSession([{ path: '', children: DASHBOARD_ROUTES }]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    // Stable means every request has been answered, which a test of the loading state must not wait for.
    if (settle) await view.fixture.whenStable();
    return { ...view, router, location: TestBed.inject(Location) };
  }

  const dateBox = () => screen.getByRole('textbox', { name: 'Date' });
  const card = (name: string) => screen.getByRole('region', { name });
  const kpi = (label: string) =>
    found(within(card('Key figures')).getByText(label).nextElementSibling);
  const found = (element: Element | null | undefined): HTMLElement => {
    if (!(element instanceof HTMLElement)) throw new Error('element not found');
    return element;
  };
  const content = () => found(card('Key figures').closest('[aria-busy]'));
  const days = (date: string) => date.split('-').reverse().join('/');

  describe('the page', () => {
    it('has a title, and a subtitle that names the day, read in UTC', async () => {
      await open();

      expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
      expect(screen.getByText('Across all locations on 14 Oct 2026')).toBeInTheDocument();
      expect(dateBox()).toHaveValue('14/10/2026');
    });

    it('asks for today, as the address names no day', async () => {
      await open();

      expect(requests.map((url) => url.searchParams.get('date'))).toEqual(['2026-10-14']);
    });

    it('shows the day the address names', async () => {
      await open('/?date=2026-10-12');

      expect(screen.getByText('Across all locations on 12 Oct 2026')).toBeInTheDocument();
      expect(dateBox()).toHaveValue('12/10/2026');
      expect(requests.map((url) => url.searchParams.get('date'))).toEqual(['2026-10-12']);
    });

    it('shows today for a day that is not one', async () => {
      await open('/?date=2026-02-31');

      expect(screen.getByText('Across all locations on 14 Oct 2026')).toBeInTheDocument();
      expect(requests.map((url) => url.searchParams.get('date'))).toEqual(['2026-10-14']);
    });

    it('names the headings of the cards as h2, under the page’s one h1', async () => {
      await open();

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(
        screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
      ).toEqual(['Occupancy by location', 'Bookings by status', 'Coming up']);
    });
  });

  describe('while it loads', () => {
    it('shows the heading and says it is loading, until the answer comes', async () => {
      answer(expected(), { after: 200 });
      await open('/', { settle: false });

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Dashboard' }),
      ).toBeInTheDocument();
      expect(await screen.findByRole('status')).toHaveTextContent('Loading dashboard…');
      expect(screen.queryByRole('region', { name: 'Key figures' })).not.toBeInTheDocument();
      expect(await screen.findByRole('region', { name: 'Key figures' })).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('key figures', () => {
    it('shows the bookings, the occupancy, the revenue of the month and the active members', async () => {
      await open();
      const { kpis } = expected();

      expect(kpi('Bookings')).toHaveTextContent(String(kpis.bookingsToday));
      expect(kpi('Occupancy')).toHaveTextContent(`${Math.round(kpis.occupancyRate * 100)}%`);
      expect(kpi('Revenue in October 2026')).toHaveTextContent(formatMoney(kpis.revenueMonth));
      expect(kpi('Active members')).toHaveTextContent(String(kpis.activeMembers));
    });

    it('reads a rate to the nearest whole percent', async () => {
      answer({
        ...expected(),
        kpis: { bookingsToday: 3, occupancyRate: 0.4249, revenueMonth: 123456, activeMembers: 7 },
      });
      await open();

      expect(kpi('Occupancy')).toHaveTextContent('42%');
      expect(kpi('Revenue in October 2026')).toHaveTextContent('€1,234.56');
    });
  });

  describe('the revenue of the month', () => {
    it('names the month of the day shown, and the figure is that month’s', async () => {
      await open('/?date=2026-09-30');

      expect(kpi('Revenue in September 2026')).toHaveTextContent(
        formatMoney(expected('2026-09-30').kpis.revenueMonth),
      );
      expect(screen.queryByText('Revenue in October 2026')).not.toBeInTheDocument();
    });

    it('follows the day when another is chosen', async () => {
      await open();

      await userEvent.clear(dateBox());
      await userEvent.type(dateBox(), '01/11/2026');

      expect(await screen.findByText('Revenue in November 2026')).toBeInTheDocument();
    });
  });

  describe('occupancy by location', () => {
    it('links each location to its page, with its booked hours of its available hours', async () => {
      await open();
      const section = card('Occupancy by location');

      const { occupancy } = expected();
      expect(occupancy.length).toBeGreaterThan(1);
      for (const location of occupancy) {
        const link = within(section).getByRole('link', { name: location.locationName });
        expect(link).toHaveAttribute('href', `/locations/${location.locationId}`);
        const row = link.closest('li') as HTMLElement;
        expect(row).toHaveTextContent(`${location.bookedHours} of ${location.availableHours} h`);
      }
    });

    it('draws each bar as a progress bar named for its location, at its share of the hours', async () => {
      await open();

      for (const location of expected().occupancy) {
        const bar = screen.getByRole('progressbar', { name: `${location.locationName} occupancy` });
        expect(bar).toHaveAttribute(
          'aria-valuenow',
          String(Math.round((location.bookedHours / location.availableHours) * 100)),
        );
      }
    });

    it('gives each bar the hours as its text, as a percentage alone says little', async () => {
      await open();

      for (const location of expected().occupancy) {
        expect(
          screen.getByRole('progressbar', { name: `${location.locationName} occupancy` }),
        ).toHaveAttribute(
          'aria-valuetext',
          `${location.bookedHours} of ${location.availableHours} h`,
        );
      }
    });

    it('draws an empty bar for a location with no hours to book, and rounds the hours', async () => {
      answer({
        ...expected(),
        occupancy: [
          { locationId: 'loc_a', locationName: 'Closed Annex', bookedHours: 0, availableHours: 0 },
          {
            locationId: 'loc_b',
            locationName: 'Odd Hours',
            bookedHours: 2.5,
            availableHours: 10.333,
          },
        ],
      });
      await open();

      const closed = screen.getByRole('progressbar', { name: 'Closed Annex occupancy' });
      expect(closed).toHaveAttribute('aria-valuenow', '0');
      expect(screen.getByRole('link', { name: 'Closed Annex' }).closest('li')).toHaveTextContent(
        '0 of 0 h',
      );
      expect(screen.getByRole('progressbar', { name: 'Odd Hours occupancy' })).toHaveAttribute(
        'aria-valuenow',
        '24',
      );
      expect(screen.getByRole('link', { name: 'Odd Hours' }).closest('li')).toHaveTextContent(
        '2.5 of 10.3 h',
      );
    });

    it('says so when there is no location to show', async () => {
      answer({ ...expected(), occupancy: [] });
      await open();

      expect(within(card('Occupancy by location')).getByText('No active locations.')).toBeVisible();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  describe('bookings by status', () => {
    const items = () => within(card('Bookings by status')).getAllByRole('listitem');
    const fill = (item: HTMLElement) => found(item.querySelector('.fill')).style.width;

    it('lists every status in order, each with its count', async () => {
      await open();
      const { byStatus } = expected();

      expect(items().map((item) => item.textContent.trim())).toEqual(
        BOOKING_STATUSES.map((status) => `${humanize(status)}${byStatus[status]}`),
      );
    });

    it('sizes each bar by its count against the biggest one', async () => {
      answer({
        ...expected(),
        byStatus: {
          pending: 5,
          confirmed: 10,
          checked_in: 0,
          completed: 2,
          cancelled: 1,
          no_show: 0,
        },
      });
      await open();

      expect(items().map(fill)).toEqual(['50%', '100%', '0%', '20%', '10%', '0%']);
    });

    it('keeps all six statuses, with empty bars, for a day without bookings', async () => {
      answer({
        ...expected(),
        byStatus: Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0])) as Dashboard['byStatus'],
      });
      await open();

      expect(items().map((item) => item.textContent.trim())).toEqual([
        'Pending0',
        'Confirmed0',
        'Checked in0',
        'Completed0',
        'Cancelled0',
        'No show0',
      ]);
      expect(items().map(fill)).toEqual(Array<string>(6).fill('0%'));
    });

    it('leaves the bars out of the accessibility tree, which hears the status and the count', async () => {
      await open();

      expect(within(card('Bookings by status')).queryAllByRole('progressbar')).toHaveLength(0);
      expect(items().map((item) => item.textContent.trim())).toContain(
        `Completed${expected().byStatus.completed}`,
      );
    });
  });

  describe('coming up', () => {
    it('lists the next bookings with when, where and who, in the order the API sends them', async () => {
      await open();
      const { upcoming } = expected();
      expect(upcoming.length).toBeGreaterThan(0);

      const rows = within(card('Coming up')).getAllByRole('listitem');
      expect(rows).toHaveLength(upcoming.length);
      upcoming.forEach((booking, i) => {
        const link = within(rows[i]).getByRole('link', {
          name: new RegExp(`UTC, ${booking.roomName}$`),
        });
        expect(link).toHaveAttribute('href', `/bookings/${booking.id}`);
        expect(rows[i]).toHaveTextContent(`${booking.roomName} · ${booking.locationName}`);
        expect(rows[i]).toHaveTextContent(booking.memberName);
        expect(rows[i]).toHaveTextContent(humanize(booking.status));
      });
    });

    it('reads the times in UTC and says so, as the answer holds no time zone', async () => {
      const [booking] = expected().upcoming;
      answer({
        ...expected(),
        upcoming: [
          { ...booking, startsAt: '2026-10-20T06:00:00.000Z', endsAt: '2026-10-20T08:30:00.000Z' },
        ],
      });
      await open();

      const link = screen.getByRole('link', {
        name: `20 Oct 2026, 06:00–08:30 UTC, ${booking.roomName}`,
      });
      expect(link).toHaveAttribute('href', `/bookings/${booking.id}`);
      expect(link).toHaveTextContent('20 Oct 2026, 06:00–08:30 UTC');
    });

    it('links to all the bookings', async () => {
      await open();

      expect(within(card('Coming up')).getByRole('link', { name: 'All bookings' })).toHaveAttribute(
        'href',
        '/bookings',
      );
    });

    it('says nothing is scheduled when nothing is', async () => {
      answer({ ...expected(), upcoming: [] });
      await open();

      expect(within(card('Coming up')).getByText('Nothing scheduled.')).toBeVisible();
      expect(within(card('Coming up')).queryAllByRole('listitem')).toHaveLength(0);
      expect(within(card('Coming up')).getByRole('link', { name: 'All bookings' })).toBeVisible();
    });

    it('does not depend on the day', async () => {
      const { upcoming } = expected();
      await open('/?date=2026-09-01');

      const links = within(card('Coming up'))
        .getAllByRole('listitem')
        .map((row) => within(row).getAllByRole('link')[0].getAttribute('href'));
      expect(links).toEqual(upcoming.map((booking) => `/bookings/${booking.id}`));
    });
  });

  describe('choosing a day', () => {
    it('loads the day typed into the date box and writes it into the address', async () => {
      const { location } = await open();

      await userEvent.clear(dateBox());
      await userEvent.type(dateBox(), '12/10/2026');

      await vi.waitFor(() => {
        expect(location.path()).toBe('/?date=2026-10-12');
      });
      await vi.waitFor(() => {
        expect(requests.map((url) => url.searchParams.get('date'))).toEqual([
          '2026-10-14',
          '2026-10-12',
        ]);
      });
      expect(await screen.findByText('Across all locations on 12 Oct 2026')).toBeInTheDocument();
      expect(kpi('Bookings')).toHaveTextContent(String(expected('2026-10-12').kpis.bookingsToday));
    });

    it('loads the day picked from the calendar', async () => {
      const { location } = await open();

      await userEvent.click(screen.getByRole('button', { name: 'Choose the day' }));
      await userEvent.click(await screen.findByRole('button', { name: '12 Oct 2026' }));

      await vi.waitFor(() => {
        expect(location.path()).toBe('/?date=2026-10-12');
      });
      expect(dateBox()).toHaveValue('12/10/2026');
    });

    it('takes the day off the address when today is chosen', async () => {
      const { location } = await open('/?date=2026-10-12');

      await userEvent.clear(dateBox());
      await userEvent.type(dateBox(), '14/10/2026');

      await vi.waitFor(() => {
        expect(location.path()).toBe('/');
      });
      expect(await screen.findByText('Across all locations on 14 Oct 2026')).toBeInTheDocument();
    });

    it('goes back to today when the box is emptied and left, and shows today in it', async () => {
      const { location } = await open('/?date=2026-10-12');

      await userEvent.clear(dateBox());
      expect(dateBox()).toHaveValue('');
      expect(location.path()).toBe('/?date=2026-10-12');
      await userEvent.tab();

      await vi.waitFor(() => {
        expect(location.path()).toBe('/');
      });
      await vi.waitFor(() => {
        expect(dateBox()).toHaveValue('14/10/2026');
      });
      expect(await screen.findByText('Across all locations on 14 Oct 2026')).toBeInTheDocument();
    });

    it('leaves a day that is being typed alone until it is whole', async () => {
      const { location } = await open('/?date=2026-10-12');

      await userEvent.clear(dateBox());
      await userEvent.type(dateBox(), '13/10/20');

      expect(dateBox()).toHaveValue('13/10/20');
      expect(location.path()).toBe('/?date=2026-10-12');
      await userEvent.type(dateBox(), '26');
      await vi.waitFor(() => {
        expect(location.path()).toBe('/?date=2026-10-13');
      });
    });

    it('brings the box back to today when text that is no day is left in it', async () => {
      await open('/?date=2026-10-12');

      await userEvent.clear(dateBox());
      await userEvent.type(dateBox(), '13/1');
      await userEvent.tab();

      await vi.waitFor(() => {
        expect(dateBox()).toHaveValue('14/10/2026');
      });
    });

    it('leaves the box as the address has it when the navigation to a typed day fails', async () => {
      const { router } = await open('/?date=2026-10-12');
      vi.spyOn(router, 'navigate').mockRejectedValueOnce(new Error('navigation failed'));

      await userEvent.clear(dateBox());
      await userEvent.type(dateBox(), '13/10/2026');

      await vi.waitFor(() => {
        expect(dateBox()).toHaveValue('12/10/2026');
      });
      expect(screen.getByText('Across all locations on 12 Oct 2026')).toBeInTheDocument();
    });

    it('shows the address’s day in the box when the navigation to today fails', async () => {
      const { router } = await open('/?date=2026-10-12');
      vi.spyOn(router, 'navigate').mockRejectedValueOnce(new Error('navigation failed'));

      await userEvent.clear(dateBox());
      await userEvent.tab();

      await vi.waitFor(() => {
        expect(dateBox()).toHaveValue('12/10/2026');
      });
    });

    it('follows the address when Back restores a day', async () => {
      const { router, location } = await open('/?date=2026-10-12');
      await router.navigateByUrl('/?date=2026-10-13');
      expect(await screen.findByText('Across all locations on 13 Oct 2026')).toBeInTheDocument();

      location.back();

      expect(await screen.findByText('Across all locations on 12 Oct 2026')).toBeInTheDocument();
      expect(dateBox()).toHaveValue(days('2026-10-12'));
    });

    it('keeps the last figures on screen, marked busy and with a progress bar, while another day loads', async () => {
      await open();
      const before = kpi('Bookings').textContent;
      answer(expected('2026-10-12'), { after: 300 });

      await userEvent.clear(dateBox());
      await userEvent.type(dateBox(), '12/10/2026');

      await vi.waitFor(() => {
        expect(content()).toHaveAttribute('aria-busy', 'true');
      });
      expect(screen.getByRole('progressbar', { name: 'Updating the dashboard' })).toBeVisible();
      expect(kpi('Bookings').textContent).toBe(before);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByText('Across all locations on 12 Oct 2026')).toBeInTheDocument();

      await vi.waitFor(() => {
        expect(content()).toHaveAttribute('aria-busy', 'false');
      });
      expect(
        screen.queryByRole('progressbar', { name: 'Updating the dashboard' }),
      ).not.toBeInTheDocument();
      expect(kpi('Bookings')).toHaveTextContent(String(expected('2026-10-12').kpis.bookingsToday));
    });
  });

  describe('a load that fails', () => {
    it('says what went wrong and tries again on request', async () => {
      server.use(
        http.get(apiUrl('/dashboard'), () =>
          HttpResponse.json({ message: 'The database is down' }, { status: 503 }),
        ),
      );
      await open();

      const notice = (
        await screen.findByRole('heading', { level: 2, name: 'Could not load the dashboard' })
      ).closest('app-empty-state');
      expect(within(found(notice)).getByText('The database is down')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Key figures' })).not.toBeInTheDocument();

      server.resetHandlers();
      installMockApi();
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(await screen.findByRole('region', { name: 'Key figures' })).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Could not load the dashboard' }),
      ).not.toBeInTheDocument();
    });

    it('does not show the figures of one day for another whose load failed', async () => {
      await open();
      server.use(
        http.get(apiUrl('/dashboard'), () =>
          HttpResponse.json({ message: 'Boom' }, { status: 500 }),
        ),
      );

      await userEvent.clear(dateBox());
      await userEvent.type(dateBox(), '12/10/2026');

      expect(
        await screen.findByRole('heading', { name: 'Could not load the dashboard' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Key figures' })).not.toBeInTheDocument();
    });
  });
});
