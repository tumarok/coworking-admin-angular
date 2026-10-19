import { type CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { inject } from '@angular/core';
import { loginRedirect, readReturnUrl } from './return-url';
import { SessionStore } from './session-store';

/**
 * Lets a signed-in visitor through. Without a token the visitor goes to the sign-in page, which
 * sends them back here afterwards. With a token but no user (a reloaded tab) the navigation waits
 * for `GET /auth/me`: a 401 there ends the session and sends the visitor to sign in, any other
 * failure lets them in.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const signIn = () => {
    const { tree, extras } = loginRedirect(router, state.url);
    return new RedirectCommand(tree, extras);
  };

  if (session.user() !== null) return true;
  if (session.token() === null) return signIn();
  return session.loadUser().then(() => (session.token() === null ? signIn() : true));
};

/** Keeps a signed-in visitor off the sign-in page: they go where they were headed, or home. */
export const guestGuard: CanActivateFn = (route) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (session.token() === null) return true;

  const target = readReturnUrl(router.currentNavigation()?.extras.state, route.queryParams);
  return new RedirectCommand(router.parseUrl(target ?? '/'), { replaceUrl: true });
};
