import { MediaMatcher } from '@angular/cdk/layout';
import { Component, type DebugElement } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSidenavContent } from '@angular/material/sidenav';
import { By, Title } from '@angular/platform-browser';
import { Router, RouterOutlet, type Routes, TitleStrategy } from '@angular/router';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideTestApp } from '@testing/test-providers';
import { NotFoundPage } from './not-found-page';
import { PageTitleStrategy } from './page-title-strategy';
import { Shell } from './shell';

@Component({ template: '<h1>A page</h1>' })
class Page {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Outlet {}

/** A `MediaMatcher` whose single media query is switched by the test. */
class FakeMediaMatcher {
  matches = false;
  private readonly listeners = new Set<(event: { matches: boolean; media: string }) => void>();

  matchMedia = (media: string) => ({
    media,
    matches: this.matches,
    addListener: (listener: (event: { matches: boolean; media: string }) => void) =>
      this.listeners.add(listener),
    removeListener: (listener: (event: { matches: boolean; media: string }) => void) =>
      this.listeners.delete(listener),
  });

  set(matches: boolean) {
    this.matches = matches;
    for (const listener of this.listeners) listener({ matches, media: '' });
  }
}

const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', pathMatch: 'full', component: Page, title: 'Dashboard' },
      { path: 'locations', component: Page, title: 'Locations' },
      { path: 'rooms/:id', component: Page, title: 'Room' },
      { path: '**', component: NotFoundPage, title: 'Page not found' },
    ],
  },
];

describe('Shell', () => {
  let media: FakeMediaMatcher;

  async function open(url = '/', width: 'wide' | 'narrow' = 'wide') {
    media = new FakeMediaMatcher();
    media.matches = width === 'narrow';
    const view = await render(Outlet, {
      providers: [
        provideTestApp(routes),
        { provide: MediaMatcher, useValue: media },
        { provide: TitleStrategy, useClass: PageTitleStrategy },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await view.fixture.whenStable();
    return { ...view, router };
  }

  const navigation = () => screen.getByRole('navigation', { name: 'Main' });

  describe('structure', () => {
    it('has a banner, the main navigation and the page as landmarks', async () => {
      await open();

      expect(screen.getByRole('banner')).toHaveTextContent('Coworking Admin');
      expect(navigation()).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('puts the account menu in the top bar', async () => {
      await open();

      expect(
        within(screen.getByRole('banner')).getByRole('button', { name: 'Account menu' }),
      ).toBeInTheDocument();
    });

    it('lists the sections of the app in order, each a link', async () => {
      await open();

      const links = within(navigation()).getAllByRole('link');
      expect(links.map((link) => [link.textContent.trim(), link.getAttribute('href')])).toEqual([
        ['Dashboard', '/'],
        ['Locations', '/locations'],
        ['Rooms', '/rooms'],
        ['Members', '/members'],
        ['Bookings', '/bookings'],
      ]);
    });

    it('shows the name of the app as a link to the start page', async () => {
      await open('/locations');

      await userEvent.click(within(screen.getByRole('banner')).getByRole('link'));

      expect(TestBed.inject(Router).url).toBe('/');
    });

    it('renders the page in the main landmark', async () => {
      await open('/locations');

      expect(
        within(screen.getByRole('main')).getByRole('heading', { name: 'A page' }),
      ).toBeInTheDocument();
    });
  });

  describe('active link', () => {
    const current = () =>
      within(navigation())
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.textContent.trim());

    it('marks the section the page belongs to', async () => {
      await open('/locations');

      expect(current()).toEqual(['Locations']);
    });

    it('marks the dashboard only on exactly its path', async () => {
      await open('/');
      expect(current()).toEqual(['Dashboard']);

      await TestBed.inject(Router).navigateByUrl('/locations');
      expect(current()).toEqual(['Locations']);
    });

    it('keeps a section active on its sub-pages and with a query', async () => {
      await open('/rooms/room_7?tab=bookings');

      expect(current()).toEqual(['Rooms']);
    });

    it('marks nothing on a page outside the sections', async () => {
      await open('/nowhere');

      expect(current()).toEqual([]);
    });

    it('moves with the navigation', async () => {
      await open('/locations');

      await userEvent.click(within(navigation()).getByRole('link', { name: 'Dashboard' }));

      expect(current()).toEqual(['Dashboard']);
    });
  });

  describe('on a wide screen', () => {
    it('shows the navigation beside the page, without a menu button', async () => {
      await open('/', 'wide');

      expect(navigation()).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
    });
  });

  describe('on a narrow screen', () => {
    it('hides the navigation behind a menu button', async () => {
      await open('/', 'narrow');

      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    it('opens the drawer from the menu button', async () => {
      await open('/', 'narrow');

      await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

      expect(navigation()).toBeVisible();
      expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    it('closes the drawer after a link is followed', async () => {
      const { router } = await open('/', 'narrow');
      await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

      await userEvent.click(within(navigation()).getByRole('link', { name: 'Locations' }));

      expect(router.url).toBe('/locations');
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    });

    it('closes the drawer on Escape', async () => {
      await open('/', 'narrow');
      await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

      // The CDK reads the legacy `keyCode`, which `userEvent.keyboard` leaves at 0.
      fireEvent.keyDown(navigation(), { key: 'Escape', keyCode: 27 });

      await vi.waitFor(() => {
        expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute(
          'aria-expanded',
          'false',
        );
      });
    });

    it('closes the drawer on a click outside it', async () => {
      await open('/', 'narrow');
      await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

      const backdrop = document.querySelector('.mat-drawer-backdrop');
      if (!backdrop) throw new Error('The drawer has no backdrop');
      await userEvent.click(backdrop);

      await vi.waitFor(() => {
        expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
      });
    });

    it('starts closed again after a trip to a wide screen', async () => {
      const { fixture } = await open('/', 'narrow');
      await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

      media.set(false);
      await vi.waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
      });
      media.set(true);
      await fixture.whenStable();

      expect(await screen.findByRole('button', { name: 'Open navigation' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    });

    it('switches to the side navigation when the screen grows', async () => {
      const { fixture } = await open('/', 'narrow');
      await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

      media.set(false);
      await fixture.whenStable();

      expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
      expect(navigation()).toBeVisible();
    });
  });

  describe('keyboard', () => {
    it('has a skip link that moves focus to the page without navigating', async () => {
      const { router } = await open('/locations');

      const skip = screen.getByRole('link', { name: 'Skip to main content' });
      await userEvent.click(skip);

      expect(screen.getByRole('main')).toHaveFocus();
      expect(router.url).toBe('/locations');
    });

    it('puts the skip link first in the tab order', async () => {
      await open('/');

      await userEvent.tab();

      expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();
    });
  });

  describe('page title', () => {
    it('names the page and the app', async () => {
      await open('/locations');

      expect(TestBed.inject(Title).getTitle()).toBe('Locations · Coworking Admin');
    });

    it('follows the navigation', async () => {
      await open('/locations');

      await userEvent.click(within(navigation()).getByRole('link', { name: 'Dashboard' }));

      expect(TestBed.inject(Title).getTitle()).toBe('Dashboard · Coworking Admin');
    });
  });

  describe('not found', () => {
    it('shows the not found page inside the shell for an unknown address', async () => {
      await open('/no/such/page');

      expect(
        within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'Page not found' }),
      ).toBeInTheDocument();
      expect(navigation()).toBeInTheDocument();
      expect(TestBed.inject(Title).getTitle()).toBe('Page not found · Coworking Admin');
    });

    it('leads back to the dashboard', async () => {
      const { router } = await open('/no/such/page');

      await userEvent.click(screen.getByRole('link', { name: 'Back to the dashboard' }));

      expect(router.url).toBe('/');
    });
  });

  describe('scrolling', () => {
    const scrolled = (fixture: { debugElement: DebugElement }) => {
      const content = fixture.debugElement.query(By.directive(MatSidenavContent));
      return vi.spyOn(content.injector.get(MatSidenavContent), 'scrollTo');
    };

    it('starts a new page at the top', async () => {
      const { fixture, router } = await open('/locations');
      const scrollTo = scrolled(fixture);

      await router.navigateByUrl('/');

      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    });

    it('keeps the place when only the query changes', async () => {
      const { fixture, router } = await open('/locations');
      const scrollTo = scrolled(fixture);

      await router.navigateByUrl('/locations?page=2');

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('moves focus to the new page, so the keyboard does not start from the old link', async () => {
      const { router } = await open('/locations');
      expect(screen.getByRole('main')).not.toHaveFocus();

      await userEvent.click(within(navigation()).getByRole('link', { name: 'Dashboard' }));

      expect(router.url).toBe('/');
      expect(screen.getByRole('main')).toHaveFocus();
    });

    it('leaves focus alone when only the query changes', async () => {
      const { router } = await open('/locations');
      within(navigation()).getByRole('link', { name: 'Locations' }).focus();

      await router.navigateByUrl('/locations?page=2');

      expect(screen.getByRole('main')).not.toHaveFocus();
    });
  });

  describe('loading a page', () => {
    it('shows a progress bar while the next page loads', async () => {
      let finish: () => void = () => undefined;
      const slow = new Promise<typeof Page>((resolve) => {
        finish = () => {
          resolve(Page);
        };
      });
      media = new FakeMediaMatcher();
      const { fixture } = await render(Outlet, {
        providers: [
          provideTestApp([
            {
              path: '',
              component: Shell,
              children: [
                { path: '', pathMatch: 'full', component: Page },
                { path: 'slow', loadComponent: () => slow },
              ],
            },
          ]),
          { provide: MediaMatcher, useValue: media },
        ],
      });
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/');
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

      const navigation = router.navigateByUrl('/slow');
      expect(await screen.findByRole('progressbar', { name: 'Loading page' })).toBeInTheDocument();

      finish();
      await navigation;
      await fixture.whenStable();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('shows no bar for a new query on the same page', async () => {
      let finish: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      let holding = false;
      media = new FakeMediaMatcher();
      const { fixture } = await render(Outlet, {
        providers: [
          provideTestApp([
            {
              path: '',
              component: Shell,
              children: [
                {
                  path: 'list',
                  component: Page,
                  runGuardsAndResolvers: 'always',
                  resolve: { held: () => (holding ? gate : undefined) },
                },
              ],
            },
          ]),
          { provide: MediaMatcher, useValue: media },
        ],
      });
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/list');

      holding = true;
      const navigation = router.navigateByUrl('/list?page=2');
      await vi.waitFor(() => {
        expect(router.currentNavigation()).not.toBeNull();
      });
      fixture.detectChanges();

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

      finish();
      await navigation;
    });
  });
});
