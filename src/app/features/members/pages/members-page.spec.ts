import { Location as BrowserLocation } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { type Member, memberFullName } from '@shared/api/contract';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { MEMBER_ROUTES } from '../members.routes';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

/** Names in the order the API lists them: by last name, then first name. */
const namesOf = (members: readonly Member[]) =>
  [...members]
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
    .map(memberFullName);

describe('MembersPage', () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: URL[];
  let names: { all: string[]; team: string[]; suspended: string[] };

  beforeEach(() => {
    api = installMockApi();
    signIn();
    names = {
      all: namesOf(api.db.members),
      team: namesOf(api.db.members.filter((m) => m.plan === 'team')),
      suspended: namesOf(api.db.members.filter((m) => m.status === 'suspended')),
    };

    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/members')) requests.push(url);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  async function open(url = '/members') {
    const view = await render(Outlet, {
      providers: provideTestSession([{ path: 'members', children: MEMBER_ROUTES }]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await view.fixture.whenStable();
    return { ...view, router, location: TestBed.inject(BrowserLocation) };
  }

  const rowNames = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0].textContent.trim());
  const queryOf = (url: URL) => Object.fromEntries(url.searchParams);
  const loaded = (expected: string[]) =>
    vi.waitFor(() => {
      expect(rowNames()).toEqual(expected);
    });
  const rowOf = (member: Member) => {
    const row = screen.getByRole('link', { name: memberFullName(member) }).closest('tr');
    if (!row) throw new Error('The name is not in a row');
    return row;
  };
  const searchbox = () => screen.getByRole('searchbox', { name: 'Search name, email or company' });

  describe('the page', () => {
    it('has a title and a subtitle', async () => {
      await open();

      expect(screen.getByRole('heading', { level: 1, name: 'Members' })).toBeInTheDocument();
      expect(screen.getByText('People and teams with a plan')).toBeInTheDocument();
      await loaded(names.all.slice(0, 20));
    });

    it('lists the members with their details, a link to each and a status chip', async () => {
      await open('/members?limit=100');
      await loaded(names.all);
      const member = api.db.members.find((m) => m.company && m.status === 'active');
      if (!member) throw new Error('seed has no active member with a company');

      const row = rowOf(member);
      expect(within(row).getByRole('link', { name: memberFullName(member) })).toHaveAttribute(
        'href',
        `/members/${member.id}`,
      );
      expect(within(row).getByText(member.email)).toBeInTheDocument();
      expect(within(row).getByText(member.company ?? '')).toBeInTheDocument();
      expect(within(row).getByText('Active')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Member since' })).toBeInTheDocument();
    });

    it('writes the plan in words and the join date as a date', async () => {
      const member = api.db.members.find((m) => m.plan === 'day_pass');
      if (!member) throw new Error('seed has no day pass member');
      member.joinedAt = '2026-01-05';
      await open('/members?limit=100');
      await loaded(names.all);

      const cells = within(rowOf(member)).getAllByRole('cell');

      expect(cells[3]).toHaveTextContent('Day pass');
      expect(cells[4]).toHaveTextContent('05 Jan 2026');
    });

    it('reads a missing company as a dash', async () => {
      await open('/members?limit=100');
      await loaded(names.all);
      const member = api.db.members.find((m) => m.company === null);
      if (!member) throw new Error('seed has a company for every member');

      const cells = within(rowOf(member)).getAllByRole('cell');

      expect(cells[2]).toHaveTextContent('—');
    });

    it('asks the API for the first page once', async () => {
      await open();
      await loaded(names.all.slice(0, 20));

      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1' }]);
    });

    it('opens the details of a member from the name', async () => {
      const { router } = await open();
      await loaded(names.all.slice(0, 20));

      await userEvent.click(screen.getByRole('link', { name: names.all[0] }));

      await vi.waitFor(() => {
        expect(router.url).toMatch(/^\/members\/mem_\w+$/);
      });
      expect(
        await screen.findByRole('heading', { level: 1, name: names.all[0] }),
      ).toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('puts the search in the URL and loads the list once', async () => {
      const [member] = api.db.members;
      const { location } = await open();
      await loaded(names.all.slice(0, 20));
      requests.length = 0;

      await userEvent.type(searchbox(), member.email);

      await loaded(
        namesOf(api.db.members.filter((m) => m.email.includes(member.email.toLowerCase()))),
      );
      expect(location.path()).toBe(`/members?q=${member.email}`);
      expect(requests.map(queryOf)).toEqual([{ limit: '20', page: '1', q: member.email }]);
    });

    it('finds a member by company', async () => {
      const company = api.db.members.find((m) => m.company)?.company ?? '';
      await open(`/members?q=${encodeURIComponent(company)}&limit=100`);

      await loaded(
        namesOf(
          api.db.members.filter((m) => m.company?.toLowerCase().includes(company.toLowerCase())),
        ),
      );
    });

    it('starts from the search the URL carries', async () => {
      await open('/members?q=zzzz');

      expect(searchbox()).toHaveValue('zzzz');
      expect(await screen.findByText('Nothing matches the current filters.')).toBeInTheDocument();
    });
  });

  describe('the plan filter', () => {
    it('narrows the list from page 1 with one request', async () => {
      const { location } = await open('/members?limit=100&page=1');
      await loaded(names.all);
      requests.length = 0;

      await userEvent.click(screen.getByRole('combobox', { name: 'Plan' }));
      await userEvent.click(screen.getByRole('option', { name: 'Team' }));

      await loaded(names.team);
      expect(location.path()).toBe('/members?limit=100&plan=team');
      expect(requests.map(queryOf)).toEqual([{ limit: '100', page: '1', plan: 'team' }]);
    });

    it('offers the plans in words', async () => {
      await open();
      await userEvent.click(screen.getByRole('combobox', { name: 'Plan' }));

      expect(screen.getAllByRole('option').map((option) => option.textContent.trim())).toEqual([
        'Any plan',
        'Day pass',
        'Flex',
        'Dedicated',
        'Team',
      ]);
    });

    it('shows Any plan when no filter is set, and takes the filter off again', async () => {
      const { location } = await open('/members?limit=100&plan=team');
      await loaded(names.team);
      expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveTextContent('Team');

      await userEvent.click(screen.getByRole('combobox', { name: 'Plan' }));
      await userEvent.click(screen.getByRole('option', { name: 'Any plan' }));

      await loaded(names.all);
      expect(location.path()).toBe('/members?limit=100');
    });

    it('ignores a plan the API does not know, showing the whole list under Any plan', async () => {
      await open('/members?limit=100&plan=platinum');

      await loaded(names.all);
      expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveTextContent('Any plan');
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
      expect(requests.map(queryOf)).toEqual([{ limit: '100', page: '1' }]);
    });
  });

  describe('the status filter', () => {
    it('narrows the list with one request', async () => {
      const { location } = await open('/members?limit=100');
      await loaded(names.all);
      requests.length = 0;

      await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
      await userEvent.click(screen.getByRole('option', { name: 'Suspended' }));

      await loaded(names.suspended);
      expect(location.path()).toBe('/members?limit=100&status=suspended');
      expect(requests.map(queryOf)).toEqual([{ limit: '100', page: '1', status: 'suspended' }]);
    });

    it('combines with the plan', async () => {
      await open('/members?limit=100&plan=team&status=active');

      await loaded(
        namesOf(api.db.members.filter((m) => m.plan === 'team' && m.status === 'active')),
      );
    });
  });

  describe('clearing the filters', () => {
    it('is offered only while something narrows the list', async () => {
      await open();
      await loaded(names.all.slice(0, 20));
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

      await userEvent.type(searchbox(), 'zzzz{Enter}');

      expect(await screen.findByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    });

    it('empties the search, the plan and the status together, with one request', async () => {
      const { location } = await open('/members?limit=100&q=a&plan=team&status=suspended');
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
      });
      await vi.waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      requests.length = 0;

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

      await loaded(names.all);
      expect(location.path()).toBe('/members?limit=100');
      expect(requests).toHaveLength(1);
      expect(searchbox()).toHaveValue('');
      expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveTextContent('Any plan');
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Any status');
    });
  });

  describe('pagination', () => {
    it('moves to the next page: the URL changes and exactly one request goes out', async () => {
      const { location } = await open('/members?limit=2');
      await loaded(names.all.slice(0, 2));
      requests.length = 0;

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

      await loaded(names.all.slice(2, 4));
      expect(location.path()).toBe('/members?limit=2&page=2');
      expect(requests.map(queryOf)).toEqual([{ limit: '2', page: '2' }]);
      expect(screen.getByText(`3 – 4 of ${names.all.length}`)).toBeInTheDocument();
    });

    it('restores the page from a shared link', async () => {
      await open('/members?limit=2&page=3');

      await loaded(names.all.slice(4, 6));
    });
  });

  describe('when there is nothing to show', () => {
    it('says that nothing matches the filters', async () => {
      await open('/members?q=zzzz');

      expect(await screen.findByText('Nothing matches the current filters.')).toBeInTheDocument();
    });

    it('says there are no members yet when there are none', async () => {
      api.db.members = [];

      await open();

      expect(await screen.findByText('No members yet.')).toBeInTheDocument();
    });
  });

  describe('when the load fails', () => {
    it('shows the reason in the table and loads the list again on request', async () => {
      server.use(
        http.get(
          apiUrl('/members'),
          () => HttpResponse.json({ message: 'Boom' }, { status: 500 }),
          {
            once: true,
          },
        ),
      );
      await open();

      expect(await screen.findByRole('alert')).toHaveTextContent('Boom');

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      await loaded(names.all.slice(0, 20));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('adding a member', () => {
    const fill = async (dialog: HTMLElement) => {
      await userEvent.type(within(dialog).getByRole('textbox', { name: /^First name/ }), 'Ana');
      await userEvent.type(within(dialog).getByRole('textbox', { name: /^Last name/ }), 'Pereira');
      await userEvent.type(
        within(dialog).getByRole('textbox', { name: /^Email/ }),
        'ana.pereira@example.com',
      );
      await userEvent.type(
        within(dialog).getByRole('textbox', { name: /^Phone/ }),
        '+351 21 555 01 99',
      );
    };

    it('opens the form, saves, and goes to the new member', async () => {
      const { router } = await open();
      await loaded(names.all.slice(0, 20));

      await userEvent.click(screen.getByRole('button', { name: 'New member' }));
      const dialog = await screen.findByRole('dialog', { name: 'New member' });
      await fill(dialog);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      await vi.waitFor(() => {
        expect(router.url).toMatch(/^\/members\/mem_\w+$/);
      });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Ana Pereira' }),
      ).toBeInTheDocument();
      expect(api.db.members.map((m) => m.email)).toContain('ana.pereira@example.com');
    });

    it('gives focus back to the New member button when the form is cancelled', async () => {
      await open();
      await loaded(names.all.slice(0, 20));

      await userEvent.click(screen.getByRole('button', { name: 'New member' }));
      const dialog = await screen.findByRole('dialog', { name: 'New member' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'New member' })).toHaveFocus();
      });
    });

    it('stays on the list when the form is cancelled', async () => {
      const { router } = await open();
      await loaded(names.all.slice(0, 20));

      await userEvent.click(screen.getByRole('button', { name: 'New member' }));
      const dialog = await screen.findByRole('dialog', { name: 'New member' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(router.url).toBe('/members');
    });
  });
});
