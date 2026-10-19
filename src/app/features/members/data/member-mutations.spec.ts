import { OverlayContainer } from '@angular/cdk/overlay';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createQuery } from '@core/api/create-query';
import { listTag } from '@core/api/tags';
import type { MemberInput } from '@shared/api/contract';
import { installMockApi, signIn, TEST_NOW } from '@testing/mock-api';
import { server } from '@testing/msw-server';
import { provideTestApi } from '@testing/test-providers';
import { injectCreateMember, injectDeleteMember, injectUpdateMember } from './member-mutations';
import { injectMemberQuery, injectMembersQuery } from './member-queries';

const INPUT: MemberInput = {
  firstName: 'Ana',
  lastName: 'Pereira',
  email: 'Ana.Pereira@Example.com',
  phone: '+351 21 555 01 99',
  company: null,
  plan: 'dedicated',
  status: 'active',
};

describe('member mutations', () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    TestBed.configureTestingModule({ providers: provideTestApi() });
    requests = [];
    server.events.on('request:start', ({ request }) => {
      requests.push(`${request.method} ${new URL(request.url).pathname.replace('/api/v1', '')}`);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  const inject = <T>(factory: () => T) => TestBed.runInInjectionContext(factory);
  const eventually = (check: () => void) =>
    vi.waitFor(() => {
      TestBed.tick();
      check();
    });
  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');
  const countOf = (request: string) => requests.filter((r) => r === request).length;

  /** Queries on screen that show a member, a list and what embeds one: a booking list. */
  async function mountQueries(id = api.db.members[0].id) {
    const list = inject(() => injectMembersQuery(() => ({ page: 1, limit: 100, q: '' })));
    const detail = inject(() => injectMemberQuery(() => id));
    const bookings = createQuery({
      request: () => ({ url: '/bookings', params: { limit: 1 } }),
      tags: () => [listTag('Booking')],
      injector: TestBed.inject(Injector),
    });
    const locations = createQuery({
      request: () => ({ url: '/locations', params: { limit: 1 } }),
      tags: () => [listTag('Location')],
      injector: TestBed.inject(Injector),
    });
    await eventually(() => {
      expect(list.value() && detail.value() && bookings.value() && locations.value()).toBeTruthy();
    });
    requests.length = 0;
    return { list, detail, bookings, locations };
  }

  describe('injectCreateMember', () => {
    it('posts the input and resolves with the created member', async () => {
      const create = inject(injectCreateMember);

      const created = await create.run(INPUT);

      expect(created).toMatchObject({ ...INPUT, email: 'ana.pereira@example.com' });
      expect(api.db.members.some((m) => m.id === created.id)).toBe(true);
      expect(requests).toEqual(['POST /members']);
    });

    it('reloads the lists, and what embeds a member, but not other details or locations', async () => {
      const { list, detail, bookings, locations } = await mountQueries();
      const create = inject(injectCreateMember);

      const created = await create.run(INPUT);

      await eventually(() => {
        expect(list.value()?.items.map((m) => m.id)).toContain(created.id);
      });
      expect(countOf('GET /members')).toBe(1);
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf('GET /locations')).toBe(0);
      expect(detail.value()).toBeDefined();
      expect(bookings.value()).toBeDefined();
      expect(locations.value()).toBeDefined();
    });

    it('leaves the refusal to the form: no snackbar, the rejection carries the field errors', async () => {
      const create = inject(injectCreateMember);

      await expect(create.run({ ...INPUT, phone: 'call me' })).rejects.toMatchObject({
        status: 422,
      });

      expect(create.error()?.fieldErrors).toEqual({ phone: 'Enter a valid phone number' });
      expect(snackbars()).toHaveLength(0);
    });

    it('refuses an email that is already registered, whatever its case, under the field', async () => {
      const create = inject(injectCreateMember);

      await expect(
        create.run({ ...INPUT, email: api.db.members[0].email.toUpperCase() }),
      ).rejects.toMatchObject({ status: 422 });

      expect(create.error()?.fieldErrors).toEqual({ email: 'This email is already registered' });
      expect(snackbars()).toHaveLength(0);
    });

    it('invalidates nothing when it fails', async () => {
      const { list } = await mountQueries();
      const create = inject(injectCreateMember);

      await expect(create.run({ ...INPUT, phone: 'call me' })).rejects.toBeDefined();
      await new Promise((resolve) => setTimeout(resolve, 20));
      TestBed.tick();

      expect(requests).toEqual(['POST /members']);
      expect(list.value()).toBeDefined();
    });
  });

  describe('injectUpdateMember', () => {
    it('patches that member with the whole input', async () => {
      const { id } = api.db.members[0];
      const update = inject(injectUpdateMember);

      const saved = await update.run({ id, input: INPUT });

      expect(saved).toMatchObject({ id, firstName: 'Ana', plan: 'dedicated', company: null });
      expect(api.db.members.find((m) => m.id === id)?.lastName).toBe('Pereira');
      expect(requests).toEqual([`PATCH /members/${id}`]);
    });

    it('reloads its own detail, the lists and what embeds a member', async () => {
      const { id } = api.db.members[0];
      const { detail, list, bookings, locations } = await mountQueries(id);
      const update = inject(injectUpdateMember);

      await update.run({ id, input: INPUT });

      await eventually(() => {
        expect(detail.value()?.firstName).toBe('Ana');
      });
      expect(countOf(`GET /members/${id}`)).toBe(1);
      expect(countOf('GET /members')).toBe(1);
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf('GET /locations')).toBe(0);
      expect(list.value()).toBeDefined();
      expect(bookings.value()).toBeDefined();
      expect(locations.value()).toBeDefined();
    });

    it('does not reload the detail of another member', async () => {
      const [first, second] = api.db.members;
      await mountQueries(first.id);
      const other = inject(() => injectMemberQuery(() => second.id));
      await eventually(() => {
        expect(other.value()).toBeDefined();
      });
      requests.length = 0;
      const update = inject(injectUpdateMember);

      await update.run({ id: first.id, input: INPUT });
      await eventually(() => {
        expect(countOf(`GET /members/${first.id}`)).toBe(1);
      });

      expect(countOf(`GET /members/${second.id}`)).toBe(0);
    });

    it('keeps its own email without calling it a duplicate, and refuses another member’s', async () => {
      const [first, second] = api.db.members;
      const update = inject(injectUpdateMember);

      await expect(
        update.run({ id: first.id, input: { ...INPUT, email: first.email } }),
      ).resolves.toMatchObject({ id: first.id });
      await expect(
        update.run({ id: first.id, input: { ...INPUT, email: second.email } }),
      ).rejects.toMatchObject({ status: 422 });

      expect(update.error()?.fieldErrors).toEqual({ email: 'This email is already registered' });
      expect(snackbars()).toHaveLength(0);
    });

    it('is silent too, and a missing member comes back as a 404 for the form', async () => {
      const update = inject(injectUpdateMember);

      await expect(update.run({ id: 'mem_nope', input: INPUT })).rejects.toMatchObject({
        status: 404,
      });

      expect(snackbars()).toHaveLength(0);
    });
  });

  describe('injectDeleteMember', () => {
    async function createMemberWithoutBookings() {
      return inject(injectCreateMember).run(INPUT);
    }

    it('deletes the member', async () => {
      const { id } = await createMemberWithoutBookings();
      requests.length = 0;
      const remove = inject(injectDeleteMember);

      await remove.run(id);

      expect(api.db.members.some((m) => m.id === id)).toBe(false);
      expect(requests).toEqual([`DELETE /members/${id}`]);
    });

    it('reloads the lists and what embeds a member, but not the deleted detail', async () => {
      const { id } = await createMemberWithoutBookings();
      const list = inject(() => injectMembersQuery(() => ({ page: 1, limit: 100, q: '' })));
      const detail = inject(() => injectMemberQuery(() => id));
      const bookings = createQuery({
        request: () => ({ url: '/bookings', params: { limit: 1 } }),
        tags: () => [listTag('Booking')],
        injector: TestBed.inject(Injector),
      });
      await eventually(() => {
        expect(list.value() && detail.value() && bookings.value()).toBeTruthy();
      });
      requests.length = 0;
      const remove = inject(injectDeleteMember);

      await remove.run(id);

      await eventually(() => {
        expect(list.value()?.items.map((m) => m.id)).not.toContain(id);
      });
      expect(countOf('GET /members')).toBe(1);
      expect(countOf('GET /bookings')).toBe(1);
      expect(countOf(`GET /members/${id}`)).toBe(0);
      expect(detail.error()).toBeUndefined();
    });

    it('is not silent: a member with upcoming bookings is refused with a snackbar carrying the reason', async () => {
      const busy = api.db.bookings.find(
        (b) => b.status === 'confirmed' && Date.parse(b.endsAt) > TEST_NOW,
      );
      const remove = inject(injectDeleteMember);

      await expect(remove.run(busy?.memberId ?? '')).rejects.toMatchObject({ status: 409 });

      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent(
        'This member has upcoming bookings; cancel them first',
      );
      expect(remove.error()?.status).toBe(409);
    });
  });
});
