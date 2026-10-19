import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  untracked,
} from '@angular/core';
import { ACCESS_TOKEN, ON_UNAUTHORIZED } from '@core/http/session-hooks';
import { SessionStore } from './session-store';

/** Connects the HTTP pipeline to the session: it sends the token and reports a rejected one. */
export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ACCESS_TOKEN,
      useFactory: () => {
        const session = inject(SessionStore);
        // Requests can start inside a reactive context; they must not depend on the token.
        return () => untracked(session.token);
      },
    },
    {
      provide: ON_UNAUTHORIZED,
      useFactory: () => {
        const session = inject(SessionStore);
        return (sentToken: string | null) => {
          session.expire(sentToken);
        };
      },
    },
  ]);
}
