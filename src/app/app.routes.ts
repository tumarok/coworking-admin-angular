import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@core/layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '**',
        title: 'Page not found',
        loadComponent: () => import('@core/layout/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
