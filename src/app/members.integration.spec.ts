import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy } from '@angular/router';
import { PageTitleStrategy } from '@core/layout/page-title-strategy';
import { memberFullName } from '@shared/api/contract';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { provideTestSession } from '@testing/test-providers';
import { App } from './app';
import { routes } from './app.routes';

/** The members section inside the real application: guard, shell, lazy routes and titles. */
describe('the members section of the app', () => {
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
    within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Members' });

  it('sends a visitor who is not signed in to the sign-in page, remembering the page', async () => {
    const { router } = await open('/members/mem_x');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.url).toBe('/login?from=%2Fmembers%2Fmem_x');
  });

  it('shows the list in the shell, with its navigation entry current and the tab named', async () => {
    signIn();

    await open('/members?limit=100');

    expect(await screen.findByRole('heading', { level: 1, name: 'Members' })).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: memberFullName(api.db.members[0]) }),
    ).toBeInTheDocument();
    expect(navLink()).toHaveClass('active');
    expect(document.title).toBe('Members · Coworking Admin');
  });

  it('goes from the list to a member and back, keeping the navigation entry current', async () => {
    signIn();
    const { router } = await open('/members?limit=100');
    const member = api.db.members[0];

    await userEvent.click(await screen.findByRole('link', { name: memberFullName(member) }));

    expect(
      await screen.findByRole('heading', { level: 1, name: memberFullName(member) }),
    ).toBeInTheDocument();
    expect(router.url).toBe(`/members/${member.id}`);
    expect(document.title).toBe('Member · Coworking Admin');
    expect(navLink()).toHaveClass('active');

    await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Members' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Members' })).toBeInTheDocument();
    expect(router.url).toBe('/members');
  });

  it('offers the member’s bookings as a link to the bookings list filtered to them', async () => {
    signIn();
    const member = api.db.members[0];
    await open(`/members/${member.id}`);

    expect(await screen.findByRole('link', { name: 'View bookings' })).toHaveAttribute(
      'href',
      `/bookings?memberId=${member.id}`,
    );
  });

  it('shows the not-found page for an address below a member that no route knows', async () => {
    signIn();

    await open('/members/mem_x/extra');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });
});
