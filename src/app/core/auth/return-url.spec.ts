import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { loginRedirect, readReturnUrl, safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it.each(['/', '/locations', '/rooms/room_1?tab=bookings#top', '/bookings?page=2&status=pending'])(
    'accepts the address inside the app %s',
    (url) => {
      expect(safeReturnUrl(url)).toBe(url);
    },
  );

  it.each([
    ['a protocol-relative address', '//evil.example'],
    ['a protocol-relative address with a path', '//evil.example/login'],
    ['an absolute address', 'https://evil.example'],
    ['a scheme without slashes', 'javascript:alert(1)'],
    ['a backslash browsers read as a slash', '/\\evil.example'],
    ['a tab that browsers strip', '/\t/evil.example'],
    ['a newline that browsers strip', '/\n/evil.example'],
    ['a relative path', 'locations'],
    ['an empty string', ''],
    ['the sign-in page itself', '/login'],
    ['the sign-in page with a query', '/login?from=%2Frooms'],
    ['something below the sign-in page', '/login/help'],
    ['the sign-in page with matrix parameters', '/login;x=1'],
    ['the sign-in page with a percent-encoded name', '/%6Cogin'],
    ['the sign-in page below an encoded slash', '/login%2Fhelp'],
    ['the sign-in page with a trailing slash', '/login/'],
    ['an encoded second slash', '/%2F/evil.example'],
    ['an encoded backslash', '/%5Cevil.example'],
    ['an encoded newline', '/%0A/evil.example'],
    ['a broken escape', '/%E0%A4%A'],
  ])('refuses %s', (_label, url) => {
    expect(safeReturnUrl(url)).toBeNull();
  });

  it('keeps a page whose name only starts like the sign-in page', () => {
    expect(safeReturnUrl('/login-help')).toBe('/login-help');
    expect(safeReturnUrl('/rooms;tab=login')).toBe('/rooms;tab=login');
  });

  it.each([undefined, null, 42, ['/rooms'], {}])(
    'refuses a value that is not a string: %j',
    (v) => {
      expect(safeReturnUrl(v)).toBeNull();
    },
  );
});

describe('readReturnUrl', () => {
  it('prefers the navigation state', () => {
    expect(readReturnUrl({ from: '/rooms' }, { from: '/members' })).toBe('/rooms');
  });

  it('falls back to the query when the state has none', () => {
    expect(readReturnUrl(undefined, { from: '/members' })).toBe('/members');
    expect(readReturnUrl({}, { from: '/members' })).toBe('/members');
    expect(readReturnUrl(null, { from: '/members' })).toBe('/members');
  });

  it('falls back to the query when the state holds an unsafe address', () => {
    expect(readReturnUrl({ from: '//evil.example' }, { from: '/members' })).toBe('/members');
  });

  it('returns nothing when neither is safe', () => {
    expect(readReturnUrl({ from: 'https://evil.example' }, { from: '//evil.example' })).toBeNull();
    expect(readReturnUrl(undefined, {})).toBeNull();
    expect(readReturnUrl('/rooms', {})).toBeNull();
  });
});

describe('loginRedirect', () => {
  const router = () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    return TestBed.inject(Router);
  };

  it('goes to the sign-in page, remembering the wanted page in the query and the state', () => {
    const r = router();

    const { tree, extras } = loginRedirect(r, '/bookings?page=2');

    expect(r.serializeUrl(tree)).toBe('/login?from=%2Fbookings%3Fpage%3D2');
    expect(extras).toEqual({ replaceUrl: true, state: { from: '/bookings?page=2' } });
  });

  it('does not remember the start page, which is where sign-in leads anyway', () => {
    const r = router();

    const { tree, extras } = loginRedirect(r, '/');

    expect(r.serializeUrl(tree)).toBe('/login');
    expect(extras.state).toBeUndefined();
  });

  it('does not pass an unsafe address on', () => {
    const r = router();

    const { tree, extras } = loginRedirect(r, '//evil.example');

    expect(r.serializeUrl(tree)).toBe('/login');
    expect(extras.state).toBeUndefined();
  });
});
