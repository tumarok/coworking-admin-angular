import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '@core/auth/auth-guards';

export const routes: Routes = [
  {
    // Outside the shell: a visitor who is not signed in has no navigation to show.
    path: 'login',
    title: 'Sign in',
    canActivate: [guestGuard],
    loadComponent: () => import('@features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('@core/layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadChildren: () =>
          import('@features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
      },
      {
        path: 'locations',
        loadChildren: () =>
          import('@features/locations/locations.routes').then((m) => m.LOCATION_ROUTES),
      },
      {
        path: 'rooms',
        loadChildren: () => import('@features/rooms/rooms.routes').then((m) => m.ROOM_ROUTES),
      },
      {
        path: 'members',
        loadChildren: () => import('@features/members/members.routes').then((m) => m.MEMBER_ROUTES),
      },
      {
        path: 'bookings',
        loadChildren: () =>
          import('@features/bookings/bookings.routes').then((m) => m.BOOKING_ROUTES),
      },
      {
        path: '**',
        title: 'Page not found',
        loadComponent: () => import('@core/layout/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
