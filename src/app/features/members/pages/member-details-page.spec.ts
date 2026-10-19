import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { type Member, memberFullName } from '@shared/api/contract';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn, TEST_NOW } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { delay, http, HttpResponse } from 'msw';
import { MEMBER_ROUTES } from '../members.routes';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

describe('MemberDetailsPage', () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    requests = [];
    server.events.on('request:start', ({ request }) => {
      requests.push(`${request.method} ${new URL(request.url).pathname.replace('/api/v1', '')}`);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  async function open(url: string, { settle = true } = {}) {
    const view = await render(Outlet, {
      providers: provideTestSession([{ path: 'members', children: MEMBER_ROUTES }]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    // Stable means every request has been answered, which a test of the loading state must not wait for.
    if (settle) await view.fixture.whenStable();
    return { ...view, router };
  }

  /** The first seeded member, given known details: a company, a day pass, suspended, joined on a set day. */
  const ana = (): Member => {
    const member = api.db.members[0];
    Object.assign(member, {
      firstName: 'Ana',
      lastName: 'Pereira',
      email: 'ana.pereira@example.com',
      phone: '+351 21 555 01 99',
      company: 'Pereira & Co',
      plan: 'day_pass',
      status: 'suspended',
      joinedAt: '2026-01-05',
    });
    return member;
  };
  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');
  const valueOf = (label: string) =>
    screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;
  const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

  describe('a member', () => {
    it('shows the name, the company and a way back to the list', async () => {
      const member = ana();
      await open(`/members/${member.id}`);

      expect(await heading('Ana Pereira')).toBeInTheDocument();
      expect(screen.getByText('Pereira & Co', { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('href', '/members');
    });

    it('shows the facts about the member, the email as a link to write to', async () => {
      const member = ana();
      await open(`/members/${member.id}`);
      await heading('Ana Pereira');

      expect(valueOf('Status')).toHaveTextContent('Suspended');
      expect(valueOf('Plan')).toHaveTextContent('Day pass');
      expect(within(valueOf('Email')).getByRole('link', { name: member.email })).toHaveAttribute(
        'href',
        'mailto:ana.pereira@example.com',
      );
      expect(valueOf('Phone')).toHaveTextContent('+351 21 555 01 99');
      expect(valueOf('Company')).toHaveTextContent('Pereira & Co');
      expect(valueOf('Member since')).toHaveTextContent('05 Jan 2026');
    });

    it('reads a missing company as a dash and leaves the subtitle out', async () => {
      const member = api.db.members.find((m) => m.company === null);
      if (!member) throw new Error('seed has a company for every member');
      await open(`/members/${member.id}`);
      await heading(memberFullName(member));

      expect(valueOf('Company')).toHaveTextContent('—');
      expect(document.querySelector('.subtitle')).toBeNull();
    });

    it('links to the member’s bookings, which are another feature', async () => {
      const member = ana();
      await open(`/members/${member.id}`);
      await heading('Ana Pereira');

      expect(
        within(valueOf('Bookings')).getByRole('link', { name: 'View bookings' }),
      ).toHaveAttribute('href', `/bookings?memberId=${member.id}`);
      expect(screen.queryByRole('button', { name: 'New booking' })).not.toBeInTheDocument();
    });

    it('says it is loading until the answer comes', async () => {
      const member = ana();
      server.use(
        http.get(apiUrl(`/members/${member.id}`), async () => {
          await delay(200);
          return HttpResponse.json(member);
        }),
      );
      await open(`/members/${member.id}`, { settle: false });

      expect(await screen.findByRole('status')).toHaveTextContent('Loading member…');
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(await heading('Ana Pereira')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('a member that does not exist', () => {
    it('says so and offers the list', async () => {
      await open('/members/mem_nope');

      expect(await heading('Member not found')).toBeInTheDocument();
      expect(screen.getByText('They may have been removed.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'All members' })).toHaveAttribute('href', '/members');
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });
  });

  describe('a load that fails', () => {
    it('says what went wrong and tries again on request', async () => {
      const member = ana();
      server.use(
        http.get(
          apiUrl(`/members/${member.id}`),
          () => HttpResponse.json({ message: 'Boom' }, { status: 500 }),
          { once: true },
        ),
      );
      await open(`/members/${member.id}`);

      expect(await heading('Could not load the member')).toBeInTheDocument();
      expect(screen.getByText('Boom', { selector: 'p' })).toBeInTheDocument();
      expect(screen.queryByText('Member not found')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await heading('Ana Pereira')).toBeInTheDocument();
    });
  });

  describe('deleting', () => {
    const withoutBookings = (): Member => {
      const member: Member = { ...ana(), id: 'mem_empty', email: 'empty@example.com' };
      api.db.members.push(member);
      return member;
    };
    const confirmDialog = () => screen.findByRole('alertdialog');

    it('asks first, and does nothing when the person backs out', async () => {
      const member = withoutBookings();
      const { router } = await open(`/members/${member.id}`);
      await heading('Ana Pereira');

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      const dialog = await confirmDialog();
      expect(dialog).toHaveAccessibleName('Delete Ana Pereira?');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      expect(requests).not.toContain(`DELETE /members/${member.id}`);
      expect(router.url).toBe(`/members/${member.id}`);
      expect(api.db.members.some((m) => m.id === member.id)).toBe(true);
    });

    it('deletes after the confirmation, says so with the name and goes back to the list', async () => {
      const member = withoutBookings();
      const { router } = await open(`/members/${member.id}`);
      await heading('Ana Pereira');
      const navigate = vi.spyOn(router, 'navigate');

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await userEvent.click(within(await confirmDialog()).getByRole('button', { name: 'Delete' }));

      await vi.waitFor(() => {
        expect(router.url).toBe('/members');
      });
      expect(navigate).toHaveBeenCalledWith(['/members'], { replaceUrl: true });
      expect(api.db.members.some((m) => m.id === member.id)).toBe(false);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Member removed: Ana Pereira');
      expect(await heading('Members')).toBeInTheDocument();
      expect(requests.filter((r) => r === `GET /members/${member.id}`)).toHaveLength(1);
    });

    it('stays on the page and shows the server’s reason when the member has upcoming bookings', async () => {
      const booking = api.db.bookings.find(
        (b) => b.status === 'confirmed' && Date.parse(b.endsAt) > TEST_NOW,
      );
      const member = api.db.members.find((m) => m.id === booking?.memberId);
      if (!member) throw new Error('seed has no member with an upcoming booking');
      const { router } = await open(`/members/${member.id}`);
      await heading(memberFullName(member));

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await userEvent.click(within(await confirmDialog()).getByRole('button', { name: 'Delete' }));

      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent(
        'This member has upcoming bookings; cancel them first',
      );
      expect(router.url).toBe(`/members/${member.id}`);
      expect(
        screen.getByRole('heading', { level: 1, name: memberFullName(member) }),
      ).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
      });
      expect(api.db.members.some((m) => m.id === member.id)).toBe(true);
    });
  });

  describe('editing', () => {
    const openForm = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
      return screen.findByRole('dialog', { name: 'Edit Ana Pereira' });
    };

    it('opens the form with the member’s values', async () => {
      const member = ana();
      await open(`/members/${member.id}`);
      await heading('Ana Pereira');

      const dialog = await openForm();

      expect(within(dialog).getByRole('textbox', { name: /^First name/ })).toHaveValue('Ana');
      expect(within(dialog).getByRole('textbox', { name: /^Email/ })).toHaveValue(
        'ana.pereira@example.com',
      );
      expect(within(dialog).getByRole('textbox', { name: /^Company/ })).toHaveValue('Pereira & Co');
    });

    it('shows the saved changes on the page, which reloads on its own', async () => {
      const member = ana();
      await open(`/members/${member.id}`);
      await heading('Ana Pereira');
      const dialog = await openForm();

      const company = within(dialog).getByRole('textbox', { name: /^Company/ });
      await userEvent.clear(company);
      await userEvent.type(company, 'Harbour Labs');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      await vi.waitFor(() => {
        expect(valueOf('Company')).toHaveTextContent('Harbour Labs');
      });
      expect(screen.getByText('Harbour Labs', { selector: 'p' })).toBeInTheDocument();
      expect(valueOf('Phone')).toHaveTextContent('+351 21 555 01 99');
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Member updated: Ana Pereira');
    });

    it('gives focus back to the Edit button when the form closes', async () => {
      const member = ana();
      await open(`/members/${member.id}`);
      await heading('Ana Pereira');
      const dialog = await openForm();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
      });
    });

    it('changes nothing when the form is cancelled', async () => {
      const member = ana();
      await open(`/members/${member.id}`);
      await heading('Ana Pereira');
      const dialog = await openForm();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(requests).not.toContain(`PATCH /members/${member.id}`);
      expect(screen.getByRole('heading', { level: 1, name: 'Ana Pereira' })).toBeInTheDocument();
    });
  });
});
