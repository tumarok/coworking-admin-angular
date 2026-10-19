import type { NavigationBehaviorOptions, Params, Router, UrlTree } from '@angular/router';

/** The query parameter and navigation-state key that carry the page to return to after sign-in. */
export const RETURN_KEY = 'from';

const LOGIN_PATH = '/login';

const isControl = (char: string) => char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f;

/**
 * Accepts only an address inside this app: one slash, then a path. `//host` and `/\host` are read
 * by browsers as another origin, and control characters (a tab or a newline in `/\t/host`) are
 * stripped by them before parsing, so all of these are refused, also when they only appear after
 * percent-decoding. The sign-in page itself is refused too, or a signed-out visitor would be sent
 * back to it in a loop; the router reads `/%6Cogin` and `/login;x=1` as that page, so the check
 * looks at the decoded path without matrix parameters.
 */
export function safeReturnUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  const path = value.split(/[?#]/)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (![value, decoded].every(isInsideApp)) return null;
  return isLoginPath(decoded) ? null : value;
}

const isInsideApp = (url: string) =>
  url.startsWith('/') &&
  !url.startsWith('//') &&
  !url.includes('\\') &&
  !Array.from(url).some(isControl);

const isLoginPath = (path: string) => {
  const plain = path
    .split('/')
    .map((segment) => segment.split(';')[0])
    .join('/');
  return plain === LOGIN_PATH || plain.startsWith(`${LOGIN_PATH}/`);
};

/**
 * The page a visitor wanted before signing in. The navigation state is tried first, then the
 * query: the state is lost when the sign-in address is opened fresh (a bookmark, a copied link),
 * the query is not.
 */
export function readReturnUrl(state: unknown, query: Params): string | null {
  const fromState =
    typeof state === 'object' && state !== null
      ? safeReturnUrl((state as Record<string, unknown>)[RETURN_KEY])
      : null;
  return fromState ?? safeReturnUrl(query[RETURN_KEY]);
}

/**
 * Where to send a visitor who must sign in, remembering the page they wanted. The page travels
 * twice (see {@link readReturnUrl}); the start page is the default and is not worth remembering.
 */
export function loginRedirect(
  router: Router,
  wanted: string,
): { tree: UrlTree; extras: NavigationBehaviorOptions } {
  const from = safeReturnUrl(wanted);
  const remember = from !== null && from !== '/';
  return {
    tree: router.createUrlTree(
      [LOGIN_PATH],
      remember ? { queryParams: { [RETURN_KEY]: from } } : {},
    ),
    extras: { replaceUrl: true, state: remember ? { [RETURN_KEY]: from } : undefined },
  };
}
