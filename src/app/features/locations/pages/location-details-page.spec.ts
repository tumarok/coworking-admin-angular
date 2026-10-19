import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { delay, http, HttpResponse } from 'msw';
import { LOCATION_ROUTES } from '../locations.routes';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

describe('LocationDetailsPage', () => {
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
      providers: provideTestSession([{ path: 'locations', children: LOCATION_ROUTES }]),
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    // Stable means every request has been answered, which a test of the loading state must not wait for.
    if (settle) await view.fixture.whenStable();
    return { ...view, router };
  }

  const riverside = () => {
    const location = api.db.locations.find((l) => l.id === 'loc_1');
    if (!location) throw new Error('seed has no loc_1');
    return location;
  };
  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');
  const valueOf = (label: string) =>
    screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;
  const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

  describe('a location', () => {
    it('shows its name, address and a way back to the list', async () => {
      await open('/locations/loc_1');

      expect(await heading('Riverside Hub')).toBeInTheDocument();
      expect(screen.getByText('12 Naberezhna St, Kyiv')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Locations' })).toHaveAttribute('href', '/locations');
    });

    it('shows the facts about it', async () => {
      await open('/locations/loc_1');
      await heading('Riverside Hub');

      expect(valueOf('Status')).toHaveTextContent('Active');
      expect(valueOf('City')).toHaveTextContent('Kyiv');
      expect(valueOf('Address')).toHaveTextContent('12 Naberezhna St');
      expect(valueOf('Time zone')).toHaveTextContent('Europe/Kyiv');
      expect(valueOf('Opening hours')).toHaveTextContent('08:00–21:00');
    });

    it('shows how many rooms it has and links to them, as its rooms are another feature', async () => {
      await open('/locations/loc_1');
      await heading('Riverside Hub');

      const roomCount = api.db.rooms.filter((r) => r.locationId === 'loc_1').length;
      expect(valueOf('Rooms')).toHaveTextContent(String(roomCount));
      expect(within(valueOf('Rooms')).getByRole('link', { name: 'View rooms' })).toHaveAttribute(
        'href',
        '/rooms?locationId=loc_1',
      );
    });

    it('says it is loading until the answer comes', async () => {
      server.use(
        http.get(apiUrl('/locations/loc_1'), async () => {
          await delay(200);
          return HttpResponse.json({ ...riverside(), roomCount: 1 });
        }),
      );
      await open('/locations/loc_1', { settle: false });

      expect(await screen.findByRole('status')).toHaveTextContent('Loading location…');
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(await heading('Riverside Hub')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('a location that does not exist', () => {
    it('says so and offers the list', async () => {
      await open('/locations/loc_nope');

      expect(await heading('Location not found')).toBeInTheDocument();
      expect(screen.getByText('It may have been deleted.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'All locations' })).toHaveAttribute(
        'href',
        '/locations',
      );
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });
  });

  describe('a load that fails', () => {
    it('says what went wrong and tries again on request', async () => {
      server.use(
        http.get(
          apiUrl('/locations/loc_1'),
          () => HttpResponse.json({ message: 'Boom' }, { status: 500 }),
          {
            once: true,
          },
        ),
      );
      await open('/locations/loc_1');

      expect(await heading('Could not load the location')).toBeInTheDocument();
      expect(screen.getByText('Boom', { selector: 'p' })).toBeInTheDocument();
      expect(screen.queryByText('Location not found')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await heading('Riverside Hub')).toBeInTheDocument();
    });
  });

  describe('deleting', () => {
    const emptyLocation = () => {
      api.db.locations.push({ ...riverside(), id: 'loc_empty', name: 'Empty Hub' });
    };
    const confirmDialog = () => screen.findByRole('alertdialog');

    it('asks first, and does nothing when the person backs out', async () => {
      emptyLocation();
      const { router } = await open('/locations/loc_empty');
      await heading('Empty Hub');

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      const dialog = await confirmDialog();
      expect(dialog).toHaveAccessibleName('Delete Empty Hub?');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      expect(requests).not.toContain('DELETE /locations/loc_empty');
      expect(router.url).toBe('/locations/loc_empty');
      expect(api.db.locations.some((l) => l.id === 'loc_empty')).toBe(true);
    });

    it('deletes after the confirmation, says so with the name and goes back to the list', async () => {
      emptyLocation();
      const { router } = await open('/locations/loc_empty');
      await heading('Empty Hub');
      const navigate = vi.spyOn(router, 'navigate');

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await userEvent.click(within(await confirmDialog()).getByRole('button', { name: 'Delete' }));

      await vi.waitFor(() => {
        expect(router.url).toBe('/locations');
      });
      expect(navigate).toHaveBeenCalledWith(['/locations'], { replaceUrl: true });
      expect(api.db.locations.some((l) => l.id === 'loc_empty')).toBe(false);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Location deleted: Empty Hub');
      expect(await heading('Locations')).toBeInTheDocument();
      expect(requests.filter((r) => r === 'GET /locations/loc_empty')).toHaveLength(1);
    });

    it('stays on the page and shows the server’s reason when the location still has rooms', async () => {
      const { router } = await open('/locations/loc_1');
      await heading('Riverside Hub');

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await userEvent.click(within(await confirmDialog()).getByRole('button', { name: 'Delete' }));

      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Remove or move the rooms of this location first');
      expect(router.url).toBe('/locations/loc_1');
      expect(screen.getByRole('heading', { level: 1, name: 'Riverside Hub' })).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
      });
      expect(api.db.locations.some((l) => l.id === 'loc_1')).toBe(true);
    });
  });

  describe('editing', () => {
    const openForm = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
      return screen.findByRole('dialog', { name: 'Edit Riverside Hub' });
    };

    it('opens the form with the location’s values', async () => {
      await open('/locations/loc_1');
      await heading('Riverside Hub');

      const dialog = await openForm();

      expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue('Riverside Hub');
      expect(within(dialog).getByRole('textbox', { name: /^City/ })).toHaveValue('Kyiv');
    });

    it('shows the saved changes on the page, which reloads on its own', async () => {
      await open('/locations/loc_1');
      await heading('Riverside Hub');
      const dialog = await openForm();

      const name = within(dialog).getByRole('textbox', { name: /^Name/ });
      await userEvent.clear(name);
      await userEvent.type(name, 'Riverside North');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await heading('Riverside North')).toBeInTheDocument();
      expect(valueOf('City')).toHaveTextContent('Kyiv');
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Location updated: Riverside North');
    });

    it('gives focus back to the Edit button when the form closes', async () => {
      await open('/locations/loc_1');
      await heading('Riverside Hub');
      const dialog = await openForm();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
      });
    });

    it('changes nothing when the form is cancelled', async () => {
      await open('/locations/loc_1');
      await heading('Riverside Hub');
      const dialog = await openForm();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(requests).not.toContain('PATCH /locations/loc_1');
      expect(screen.getByRole('heading', { level: 1, name: 'Riverside Hub' })).toBeInTheDocument();
    });
  });
});
