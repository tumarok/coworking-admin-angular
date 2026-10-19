import type { Routes } from '@angular/router';

/**
 * The `/bookings` section. Every page is a lazy chunk, and every route has a `title` (the shell
 * writes it into the browser tab).
 */
export const BOOKING_ROUTES: Routes = [
  {
    path: '',
    title: 'Bookings',
    loadComponent: () => import('./pages/bookings-page').then((m) => m.BookingsPage),
  },
  {
    path: ':id',
    title: 'Booking',
    loadComponent: () => import('./pages/booking-details-page').then((m) => m.BookingDetailsPage),
  },
];
