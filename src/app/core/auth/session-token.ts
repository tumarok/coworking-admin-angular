/** Where the token lives: per tab, gone when the tab closes, never shared with other tabs. */
export const TOKEN_KEY = 'coworking-admin.token';

/**
 * Storage can be missing or refuse access (a locked-down browser profile). The app then works for
 * the current page load only: a sign-in does not survive a reload, but nothing breaks.
 */
export function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token === null) sessionStorage.removeItem(TOKEN_KEY);
    else sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // See readToken: the session stays in memory.
  }
}
