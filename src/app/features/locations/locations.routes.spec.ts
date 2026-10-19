import { LOCATION_ROUTES } from './locations.routes';

describe('LOCATION_ROUTES', () => {
  it('has the list at the section root and a location under its id', () => {
    expect(LOCATION_ROUTES.map((route) => route.path)).toEqual(['', ':id']);
  });

  it('gives every route a title, which the shell writes into the browser tab', () => {
    expect(LOCATION_ROUTES.map((route) => route.title)).toEqual(['Locations', 'Location']);
  });

  it('loads each page lazily', async () => {
    const pages = await Promise.all(
      LOCATION_ROUTES.map(async (route) => {
        if (typeof route.loadComponent !== 'function') throw new Error('not lazy');
        return route.loadComponent();
      }),
    );

    expect(pages.map((page) => (page as { name: string }).name)).toEqual([
      expect.stringContaining('LocationsPage'),
      expect.stringContaining('LocationDetailsPage'),
    ]);
  });
});
