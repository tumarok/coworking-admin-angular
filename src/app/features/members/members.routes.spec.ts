import { MEMBER_ROUTES } from './members.routes';

describe('MEMBER_ROUTES', () => {
  it('has the list at the section root and a member under its id', () => {
    expect(MEMBER_ROUTES.map((route) => route.path)).toEqual(['', ':id']);
  });

  it('gives every route a title, which the shell writes into the browser tab', () => {
    expect(MEMBER_ROUTES.map((route) => route.title)).toEqual(['Members', 'Member']);
  });

  it('loads each page lazily', async () => {
    const pages = await Promise.all(
      MEMBER_ROUTES.map(async (route) => {
        if (typeof route.loadComponent !== 'function') throw new Error('not lazy');
        return route.loadComponent();
      }),
    );

    expect(pages.map((page) => (page as { name: string }).name)).toEqual([
      expect.stringContaining('MembersPage'),
      expect.stringContaining('MemberDetailsPage'),
    ]);
  });
});
