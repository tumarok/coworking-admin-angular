import { ROOM_ROUTES } from './rooms.routes';

describe('ROOM_ROUTES', () => {
  it('has the list at the section root and a room under its id', () => {
    expect(ROOM_ROUTES.map((route) => route.path)).toEqual(['', ':id']);
  });

  it('gives every route a title, which the shell writes into the browser tab', () => {
    expect(ROOM_ROUTES.map((route) => route.title)).toEqual(['Rooms', 'Room']);
  });

  it('loads each page lazily', async () => {
    const pages = await Promise.all(
      ROOM_ROUTES.map(async (route) => {
        if (typeof route.loadComponent !== 'function') throw new Error('not lazy');
        return route.loadComponent();
      }),
    );

    expect(pages.map((page) => (page as { name: string }).name)).toEqual([
      expect.stringContaining('RoomsPage'),
      expect.stringContaining('RoomDetailsPage'),
    ]);
  });
});
