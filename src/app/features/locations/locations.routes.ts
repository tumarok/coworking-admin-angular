import type { Routes } from '@angular/router';

/**
 * The `/locations` section. Every page is a lazy chunk, and every route has a `title` (the shell
 * writes it into the browser tab).
 */
export const LOCATION_ROUTES: Routes = [
  {
    path: '',
    title: 'Locations',
    loadComponent: () => import('./pages/locations-page').then((m) => m.LocationsPage),
  },
  {
    path: ':id',
    title: 'Location',
    loadComponent: () => import('./pages/location-details-page').then((m) => m.LocationDetailsPage),
  },
];
