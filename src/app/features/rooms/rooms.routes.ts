import type { Routes } from '@angular/router';

/**
 * The `/rooms` section. Every page is a lazy chunk, and every route has a `title` (the shell
 * writes it into the browser tab).
 */
export const ROOM_ROUTES: Routes = [
  {
    path: '',
    title: 'Rooms',
    loadComponent: () => import('./pages/rooms-page').then((m) => m.RoomsPage),
  },
  {
    path: ':id',
    title: 'Room',
    loadComponent: () => import('./pages/room-details-page').then((m) => m.RoomDetailsPage),
  },
];
