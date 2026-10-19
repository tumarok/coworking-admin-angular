import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { type MemberListParams, injectMemberQuery, injectMembersQuery } from './member-queries';

describe('member queries', () => {
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

  describe('injectMembersQuery', () => {
    const run = (params: ReturnType<typeof signal<MemberListParams>>) =>
      TestBed.runInInjectionContext(() => injectMembersQuery(params));

    it('asks for the page, the size, the search, the plan and the status the list state holds', async () => {
      const query = run(
        signal({ page: 2, limit: 3, q: 'example', plan: 'team', status: 'active' }),
      );

      await eventually(() => {
        expect(query.value()).toBeDefined();
      });
      expect(requests).toEqual([
        '/api/v1/members?limit=3&page=2&plan=team&q=example&status=active',
      ]);
      expect(query.value()?.page).toBe(2);
    });

    it('leaves an empty search and unset filters out of the request', async () => {
      const query = run(signal({ page: 1, limit: 20, q: '' }));

      await eventually(() => {
        expect(query.value()?.items.length).toBeGreaterThan(0);
      });
      expect(requests).toEqual(['/api/v1/members?limit=20&page=1']);
    });

    it('loads again, once, when the list state changes', async () => {
      const params = signal<MemberListParams>({ page: 1, limit: 2, q: '' });
      const query = run(params);
      await eventually(() => {
        expect(query.value()?.page).toBe(1);
      });

      params.set({ page: 2, limit: 2, q: '' });

      await eventually(() => {
        expect(query.value()?.page).toBe(2);
      });
      expect(requests).toEqual([
        '/api/v1/members?limit=2&page=1',
        '/api/v1/members?limit=2&page=2',
      ]);
    });

    it('reports a failed load as its error', async () => {
      server.use(
        http.get(apiUrl('/members'), () => HttpResponse.json({ message: 'Boom' }, { status: 500 })),
      );
      const query = run(signal({ page: 1, limit: 20, q: '' }));

      await eventually(() => {
        expect(query.error()).toMatchObject({ status: 500, message: 'Boom' });
      });
      expect(query.value()).toBeUndefined();
    });
  });

  describe('injectMemberQuery', () => {
    const run = (id: ReturnType<typeof signal<string>>) =>
      TestBed.runInInjectionContext(() => injectMemberQuery(id));

    it('loads the member with that id', async () => {
      const [first] = api.db.members;
      const query = run(signal(first.id));

      await eventually(() => {
        expect(query.value()).toEqual(first);
      });
      expect(requests).toEqual([`/api/v1/members/${first.id}`]);
    });

    it('loads another member when the id changes, without showing the previous one meanwhile', async () => {
      const [first, second] = api.db.members;
      const id = signal(first.id);
      const query = run(id);
      await eventually(() => {
        expect(query.value()?.id).toBe(first.id);
      });

      id.set(second.id);
      TestBed.tick();
      expect(query.value()).toBeUndefined();

      await eventually(() => {
        expect(query.value()?.id).toBe(second.id);
      });
    });

    it('sends an id that is not a plain word as one path segment', async () => {
      const query = run(signal('a/b?c'));

      await eventually(() => {
        expect(query.error()?.status).toBe(404);
      });
      expect(requests).toEqual(['/api/v1/members/a%2Fb%3Fc']);
    });

    it('fails with the 404 for a member that does not exist', async () => {
      const query = run(signal('mem_nope'));

      await eventually(() => {
        expect(query.error()?.status).toBe(404);
      });
      expect(query.error()?.message).toBe('Member not found');
    });
  });
});
