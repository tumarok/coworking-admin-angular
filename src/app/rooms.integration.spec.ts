import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy } from '@angular/router';
import { PageTitleStrategy } from '@core/layout/page-title-strategy';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { provideTestSession } from '@testing/test-providers';
import { App } from './app';
import { routes } from './app.routes';

/** The rooms section inside the real application: guard, shell, lazy routes and titles. */
describe('the rooms section of the app', () => {
  let api: ReturnType<typeof installMockApi>;

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
    within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Rooms' });

  it('sends a visitor who is not signed in to the sign-in page, remembering the page', async () => {
    const { router } = await open('/rooms/room_x');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.url).toBe('/login?from=%2Frooms%2Froom_x');
  });

  it('shows the list in the shell, with its navigation entry current and the tab named', async () => {
    signIn();

    await open('/rooms');

    expect(await screen.findByRole('heading', { level: 1, name: 'Rooms' })).toBeInTheDocument();
    expect(await screen.findAllByRole('link', { name: api.db.rooms[0].name })).not.toHaveLength(0);
    expect(navLink()).toHaveClass('active');
    expect(document.title).toBe('Rooms · Coworking Admin');
  });

  it('goes from the list to a room and back, keeping the navigation entry current', async () => {
    signIn();
    const { router } = await open('/rooms?locationId=loc_1');
    const room = api.db.rooms[0];

    await userEvent.click(await screen.findByRole('link', { name: room.name }));

    expect(await screen.findByRole('heading', { level: 1, name: room.name })).toBeInTheDocument();
    expect(router.url).toBe(`/rooms/${room.id}`);
    expect(document.title).toBe('Room · Coworking Admin');
    expect(navLink()).toHaveClass('active');

    await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Rooms' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Rooms' })).toBeInTheDocument();
    expect(router.url).toBe('/rooms');
  });

  it('opens a room’s location from the room, and the rooms of a location from the location', async () => {
    signIn();
    const { router } = await open(`/rooms/${api.db.rooms[0].id}`);
    const location = api.db.locations[0];

    await userEvent.click(await screen.findByRole('link', { name: location.name }));

    expect(
      await screen.findByRole('heading', { level: 1, name: location.name }),
    ).toBeInTheDocument();
    expect(router.url).toBe(`/locations/${location.id}`);

    await userEvent.click(screen.getByRole('link', { name: 'View rooms' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Rooms' })).toBeInTheDocument();
    expect(router.url).toBe(`/rooms?locationId=${location.id}`);
    await vi.waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Location' })).toHaveTextContent(location.name);
    });
    await vi.waitFor(() => {
      const shown = screen.getAllByRole('row').length - 1;
      expect(shown).toBe(api.db.rooms.filter((r) => r.locationId === location.id).length);
    });
  });

  it('shows the not-found page for an address below a room that no route knows', async () => {
    signIn();

    await open('/rooms/room_x/extra');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });
});
