import { readToken, TOKEN_KEY, writeToken } from './session-token';

describe('session token storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the token in sessionStorage under the app key', () => {
    writeToken('demo-token.usr_admin');

    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('demo-token.usr_admin');
    expect(readToken()).toBe('demo-token.usr_admin');
  });

  it('removes the token when written as null', () => {
    writeToken('demo-token.usr_admin');

    writeToken(null);

    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(readToken()).toBeNull();
  });

  it('reads nothing and writes nothing when storage refuses access', () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied);

    expect(readToken()).toBeNull();
    expect(() => {
      writeToken('demo-token.usr_admin');
    }).not.toThrow();
    expect(() => {
      writeToken(null);
    }).not.toThrow();
  });
});
