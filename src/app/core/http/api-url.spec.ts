import { isApiUrl, isLoginUrl, toApiUrl } from './api-url';

const BASE = '/api/v1';

describe('API URLs', () => {
  it('recognizes the URLs under the base', () => {
    expect(isApiUrl('/api/v1/rooms', BASE)).toBe(true);
    expect(isApiUrl('/assets/logo.svg', BASE)).toBe(false);
    expect(isApiUrl('https://example.com/api/v1/rooms', BASE)).toBe(false);
  });

  it('matches the base as a whole path segment', () => {
    expect(isApiUrl('/api/v1', BASE)).toBe(true);
    expect(isApiUrl('/api/v1?page=2', BASE)).toBe(true);
    expect(isApiUrl('/api/v1#top', BASE)).toBe(true);
    expect(isApiUrl('/api/v10/rooms', BASE)).toBe(false);
    expect(isApiUrl('/api/v1-beta/rooms', BASE)).toBe(false);
    expect(isLoginUrl('/api/v1/auth/login?x=1', BASE)).toBe(true);
    expect(isLoginUrl('/api/v1/auth/login-help', BASE)).toBe(false);
  });

  it('recognizes the sign-in endpoint', () => {
    expect(isLoginUrl('/api/v1/auth/login', BASE)).toBe(true);
    expect(isLoginUrl('/api/v1/auth/me', BASE)).toBe(false);
  });

  it('puts the base in front of an endpoint path', () => {
    expect(toApiUrl('/rooms', BASE)).toBe('/api/v1/rooms');
    expect(toApiUrl('/rooms', 'http://localhost/api/v1')).toBe('http://localhost/api/v1/rooms');
  });

  it.each(['/api/v1/rooms', 'https://example.com/rooms', '//example.com/rooms', 'assets/logo.svg'])(
    'leaves %s as it is',
    (url) => {
      expect(toApiUrl(url, BASE)).toBe(url);
    },
  );
});
