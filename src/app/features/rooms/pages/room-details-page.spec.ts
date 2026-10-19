import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { formatMoney, humanize } from '@shared/util/format';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn, TEST_NOW } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { delay, http, HttpResponse } from 'msw';
import { ROOM_ROUTES } from '../rooms.routes';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

describe('RoomDetailsPage', () => {
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
      providers: provideTestSession([{ path: 'rooms', children: ROOM_ROUTES }]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    // Stable means every request has been answered, which a test of the loading state must not wait for.
    if (settle) await view.fixture.whenStable();
    return { ...view, router };
  }

  /** A room in the first location, with the API's view of it: its location's name added. */
  const stored = () => api.db.rooms[0];
  const roomView = () => ({ ...stored(), locationName: locationNameOf(stored().locationId) });
  const locationNameOf = (id: string) => api.db.locations.find((l) => l.id === id)?.name ?? '—';
  /** A room nothing is booked in, which can be deleted. */
  const freeRoom = () => {
    api.db.rooms.push({ ...stored(), id: 'room_free', name: 'Free Room', amenities: [] });
    return 'room_free';
  };
  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');
  const valueOf = (label: string) =>
    screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;
  const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

  describe('a room', () => {
    it('shows its name, its type at its location, and a way back to the list', async () => {
      await open(`/rooms/${stored().id}`);

      expect(await heading(stored().name)).toBeInTheDocument();
      expect(
        screen.getByText(`${humanize(stored().type)} at ${roomView().locationName}`),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Rooms' })).toHaveAttribute('href', '/rooms');
    });

    it('shows the facts about it', async () => {
      await open(`/rooms/${stored().id}`);
      await heading(stored().name);

      const room = roomView();
      expect(valueOf('Status')).toHaveTextContent(humanize(room.status));
      expect(valueOf('Type')).toHaveTextContent(humanize(room.type));
      expect(valueOf('Capacity')).toHaveTextContent(`${room.capacity} seats`);
      expect(valueOf('Rate')).toHaveTextContent(`${formatMoney(room.hourlyRate)} / hour`);
    });

    it('links to its location', async () => {
      await open(`/rooms/${stored().id}`);
      await heading(stored().name);

      expect(
        within(valueOf('Location')).getByRole('link', { name: roomView().locationName }),
      ).toHaveAttribute('href', `/locations/${stored().locationId}`);
    });

    it('lists its amenities as chips', async () => {
      await open(`/rooms/${stored().id}`);
      await heading(stored().name);

      const amenities = within(valueOf('Amenities')).getByRole('list', { name: 'Amenities' });
      expect(
        within(amenities)
          .getAllByRole('listitem')
          .map((chip) => chip.textContent.trim()),
      ).toEqual(stored().amenities.map(humanize));
    });

    it('shows a dash when it has no amenities', async () => {
      await open(`/rooms/${freeRoom()}`);
      await heading('Free Room');

      expect(valueOf('Amenities')).toHaveTextContent('—');
      expect(screen.queryByRole('list', { name: 'Amenities' })).not.toBeInTheDocument();
    });

    it('says a room with a single seat has one seat', async () => {
      const id = freeRoom();
      api.db.rooms = api.db.rooms.map((r) => (r.id === id ? { ...r, capacity: 1 } : r));
      await open(`/rooms/${id}`);
      await heading('Free Room');

      expect(valueOf('Capacity')).toHaveTextContent(/^1 seat$/);
    });

    it('says, instead of linking, when its location no longer exists', async () => {
      const { locationId } = stored();
      const id = freeRoom();
      api.db.locations = api.db.locations.filter((l) => l.id !== locationId);
      await open(`/rooms/${id}`);
      await heading('Free Room');

      expect(valueOf('Location')).toHaveTextContent('Deleted location');
      expect(within(valueOf('Location')).queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText(humanize(stored().type), { selector: 'p' })).toBeInTheDocument();
    });

    it('says it is loading until the answer comes', async () => {
      server.use(
        http.get(apiUrl(`/rooms/${stored().id}`), async () => {
          await delay(200);
          return HttpResponse.json(roomView());
        }),
      );
      await open(`/rooms/${stored().id}`, { settle: false });

      expect(await screen.findByRole('status')).toHaveTextContent('Loading room…');
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(await heading(stored().name)).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('a room that does not exist', () => {
    it('says so and offers the list', async () => {
      await open('/rooms/room_nope');

      expect(await heading('Room not found')).toBeInTheDocument();
      expect(screen.getByText('It may have been deleted.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'All rooms' })).toHaveAttribute('href', '/rooms');
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });
  });

  describe('a load that fails', () => {
    it('says what went wrong and tries again on request', async () => {
      server.use(
        http.get(
          apiUrl(`/rooms/${stored().id}`),
          () => HttpResponse.json({ message: 'Boom' }, { status: 500 }),
          { once: true },
        ),
      );
      await open(`/rooms/${stored().id}`);

      expect(await heading('Could not load the room')).toBeInTheDocument();
      expect(screen.getByText('Boom', { selector: 'p' })).toBeInTheDocument();
      expect(screen.queryByText('Room not found')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await heading(stored().name)).toBeInTheDocument();
    });
  });

  describe('deleting', () => {
    const confirmDialog = () => screen.findByRole('alertdialog');

    it('asks first, and does nothing when the person backs out', async () => {
      const id = freeRoom();
      const { router } = await open(`/rooms/${id}`);
      await heading('Free Room');

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      const dialog = await confirmDialog();
      expect(dialog).toHaveAccessibleName('Delete Free Room?');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      expect(requests).not.toContain(`DELETE /rooms/${id}`);
      expect(router.url).toBe(`/rooms/${id}`);
      expect(api.db.rooms.some((r) => r.id === id)).toBe(true);
    });

    it('deletes after the confirmation, says so with the name and goes back to the list', async () => {
      const id = freeRoom();
      const { router } = await open(`/rooms/${id}`);
      await heading('Free Room');
      const navigate = vi.spyOn(router, 'navigate');

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await userEvent.click(within(await confirmDialog()).getByRole('button', { name: 'Delete' }));

      await vi.waitFor(() => {
        expect(router.url).toBe('/rooms');
      });
      expect(navigate).toHaveBeenCalledWith(['/rooms'], { replaceUrl: true });
      expect(api.db.rooms.some((r) => r.id === id)).toBe(false);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Room deleted: Free Room');
      expect(await heading('Rooms')).toBeInTheDocument();
      expect(requests.filter((r) => r === `GET /rooms/${id}`)).toHaveLength(1);
    });

    it('stays on the page and shows the server’s reason when the room has upcoming bookings', async () => {
      const booked = api.db.bookings.find(
        (b) => b.status === 'confirmed' && Date.parse(b.endsAt) > TEST_NOW,
      );
      const room = api.db.rooms.find((r) => r.id === booked?.roomId);
      if (!room) throw new Error('seed has no upcoming booking');
      const { router } = await open(`/rooms/${room.id}`);
      await heading(room.name);

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await userEvent.click(within(await confirmDialog()).getByRole('button', { name: 'Delete' }));

      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent(
        'This room has upcoming bookings; cancel them first',
      );
      expect(router.url).toBe(`/rooms/${room.id}`);
      expect(screen.getByRole('heading', { level: 1, name: room.name })).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
      });
      expect(api.db.rooms.some((r) => r.id === room.id)).toBe(true);
    });
  });

  describe('editing', () => {
    const openForm = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
      return screen.findByRole('dialog', { name: `Edit ${stored().name}` });
    };

    it('opens the form with the room’s values', async () => {
      await open(`/rooms/${stored().id}`);
      await heading(stored().name);

      const dialog = await openForm();

      expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue(stored().name);
      expect(within(dialog).getByRole('combobox', { name: /^Type/ })).toHaveTextContent(
        humanize(stored().type),
      );
    });

    it('shows the saved changes on the page, which reloads on its own', async () => {
      await open(`/rooms/${stored().id}`);
      await heading(stored().name);
      const dialog = await openForm();

      const name = within(dialog).getByRole('textbox', { name: /^Name/ });
      await userEvent.clear(name);
      await userEvent.type(name, 'Atlas North');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await heading('Atlas North')).toBeInTheDocument();
      expect(valueOf('Capacity')).toHaveTextContent(`${stored().capacity} seats`);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Room updated: Atlas North');
    });

    it('gives focus back to the Edit button when the form closes', async () => {
      await open(`/rooms/${stored().id}`);
      await heading(stored().name);
      const dialog = await openForm();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
      });
    });

    it('changes nothing when the form is cancelled', async () => {
      await open(`/rooms/${stored().id}`);
      await heading(stored().name);
      const dialog = await openForm();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(requests).not.toContain(`PATCH /rooms/${stored().id}`);
      expect(screen.getByRole('heading', { level: 1, name: stored().name })).toBeInTheDocument();
    });
  });
});
