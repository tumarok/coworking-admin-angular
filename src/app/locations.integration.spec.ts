import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy } from '@angular/router';
import { PageTitleStrategy } from '@core/layout/page-title-strategy';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { provideTestSession } from '@testing/test-providers';
import { App } from './app';
import { routes } from './app.routes';

/** The locations section inside the real application: guard, shell, lazy routes and titles. */
describe('the locations section of the app', { timeout: 20_000 }, () => {
  beforeEach(() => {
    installMockApi();
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

  it('sends a visitor who is not signed in to the sign-in page, remembering the page', async () => {
    const { router } = await open('/locations/loc_1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.url).toBe('/login?from=%2Flocations%2Floc_1');
  });

  it('shows the list in the shell, with its navigation entry current and the tab named', async () => {
    signIn();

    await open('/locations');

    expect(await screen.findByRole('heading', { level: 1, name: 'Locations' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Riverside Hub' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Locations' })).toHaveClass('active');
    expect(document.title).toBe('Locations · Coworking Admin');
  });

  it('goes from the list to a location and back, keeping the navigation entry current', async () => {
    signIn();
    const { router } = await open('/locations');

    await userEvent.click(await screen.findByRole('link', { name: 'Riverside Hub' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Riverside Hub' }),
    ).toBeInTheDocument();
    expect(router.url).toBe('/locations/loc_1');
    expect(document.title).toBe('Location · Coworking Admin');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Locations' })).toHaveClass('active');

    await userEvent.click(
      within(screen.getByRole('main')).getByRole('link', { name: 'Locations' }),
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Locations' })).toBeInTheDocument();
    expect(router.url).toBe('/locations');
  });

  it('shows the not-found page for an address below a location that no route knows', async () => {
    signIn();

    await open('/locations/loc_1/extra');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });
});
