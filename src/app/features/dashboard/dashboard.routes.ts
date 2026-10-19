import type { Routes } from '@angular/router';

/**
 * The dashboard, the page at `/`. It is a lazy chunk, and the route has a `title` (the shell
 * writes it into the browser tab).
 */
export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    title: 'Dashboard',
    loadComponent: () => import('./pages/dashboard-page').then((m) => m.DashboardPage),
  },
];
