import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { installMockApi, signIn } from '@testing/mock-api';
import { server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import { injectMemberById, injectMemberSearch } from './member-lookups';

describe('member lookups', () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    TestBed.configureTestingModule({ providers: provideTestApi() });
    requests = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.includes('/members')) requests.push(`${url.pathname}${url.search}`);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  const eventually = (check: () => void) =>
    vi.waitFor(() => {
      TestBed.tick();
      check();
    });

  describe('injectMemberSearch', () => {
    const run = (search: ReturnType<typeof signal<string>>) =>
      TestBed.runInInjectionContext(() => injectMemberSearch(search));

    it('asks the server for the first 20 members who can book', async () => {
      const query = run(signal(''));

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      expect(requests).toEqual(['/api/v1/members?limit=20&page=1&status=active']);
      expect(query.value()?.items.every((m) => m.status === 'active')).toBe(true);
      expect(query.value()?.items).toHaveLength(20);
    });

    it('passes the search on, so the server finds members by name, email or company', async () => {
      const member = api.db.members.find((m) => m.status === 'active');
      if (!member) throw new Error('seed has no active member');
      const query = run(signal(member.email));

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      expect(query.value()?.items.map((m) => m.id)).toEqual([member.id]);
    });

    it('asks again, once, when the search changes', async () => {
      const search = signal('');
      const query = run(search);
      await eventually(() => {
        expect(query.value()).toBeDefined();
      });

      search.set('zzzz-no-such-member');

      await eventually(() => {
        expect(query.value()?.total).toBe(0);
      });
      expect(requests).toHaveLength(2);
    });
  });

  describe('injectMemberById', () => {
    const run = (id: ReturnType<typeof signal<string | undefined>>) =>
      TestBed.runInInjectionContext(() => injectMemberById(id));

    it('asks for nothing without an id', async () => {
      const query = run(signal(undefined));

      TestBed.tick();
      await TestBed.inject(ApplicationRef).whenStable();

      expect(requests).toEqual([]);
      expect(query.value()).toBeUndefined();
    });

    it('loads the member with that id, whatever their status', async () => {
      const member = api.db.members.find((m) => m.status !== 'active');
      if (!member) throw new Error('seed has no inactive member');
      const query = run(signal<string | undefined>(member.id));

      await eventually(() => {
        expect(query.value()?.id).toBe(member.id);
      });
      expect(requests).toEqual([`/api/v1/members/${member.id}`]);
    });

    it('fails with the 404 for a member that does not exist', async () => {
      const query = run(signal<string | undefined>('mem_nope'));

      await eventually(() => {
        expect(query.error()?.status).toBe(404);
      });
    });
  });
});
