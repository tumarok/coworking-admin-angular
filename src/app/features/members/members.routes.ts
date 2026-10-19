import type { Routes } from '@angular/router';

/**
 * The `/members` section. Every page is a lazy chunk, and every route has a `title` (the shell
 * writes it into the browser tab).
 */
export const MEMBER_ROUTES: Routes = [
  {
    path: '',
    title: 'Members',
    loadComponent: () => import('./pages/members-page').then((m) => m.MembersPage),
  },
  {
    path: ':id',
    title: 'Member',
    loadComponent: () => import('./pages/member-details-page').then((m) => m.MemberDetailsPage),
  },
];
