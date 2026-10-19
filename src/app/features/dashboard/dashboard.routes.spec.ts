import { DASHBOARD_ROUTES } from './dashboard.routes';

describe('DASHBOARD_ROUTES', () => {
  it('has the page at the section root', () => {
    expect(DASHBOARD_ROUTES.map((route) => route.path)).toEqual(['']);
  });

  it('gives the route a title, which the shell writes into the browser tab', () => {
    expect(DASHBOARD_ROUTES.map((route) => route.title)).toEqual(['Dashboard']);
  });

  it('loads the page lazily', async () => {
    const [route] = DASHBOARD_ROUTES;
    if (typeof route.loadComponent !== 'function') throw new Error('not lazy');

    const page = await route.loadComponent();

    expect((page as { name: string }).name).toContain('DashboardPage');
  });
});
