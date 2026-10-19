import { BOOKING_ROUTES } from './bookings.routes';

describe('BOOKING_ROUTES', () => {
  it('has the list at the section root and a booking under its id', () => {
    expect(BOOKING_ROUTES.map((route) => route.path)).toEqual(['', ':id']);
  });

  it('gives every route a title, which the shell writes into the browser tab', () => {
    expect(BOOKING_ROUTES.map((route) => route.title)).toEqual(['Bookings', 'Booking']);
  });

  it('loads each page lazily', async () => {
    const pages = await Promise.all(
      BOOKING_ROUTES.map(async (route) => {
        if (typeof route.loadComponent !== 'function') throw new Error('not lazy');
        return route.loadComponent();
      }),
    );

    expect(pages.map((page) => (page as { name: string }).name)).toEqual([
      expect.stringContaining('BookingsPage'),
      expect.stringContaining('BookingDetailsPage'),
    ]);
  });
});
