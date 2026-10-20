import { test as base, expect, type Page } from '@playwright/test';

import { ApiClient } from './support/api-client';

export { expect };
export { daysFromToday, dayFirst } from './support/dates';

/** The sessionStorage key the app keeps the token under. */
const TOKEN_KEY = 'coworking-admin.token';
/** Marks a tab that already got its token, so a sign-out is not undone by the next navigation. */
const SEEDED_KEY = 'e2e.token-seeded';

export const ADMIN = { email: 'admin@coworking.test', password: 'demo1234' } as const;

interface Fixtures {
  /** The mock API, reset to its seeded data and signed in as the admin. Runs for every test. */
  api: ApiClient;
  /** A page that is signed in from its first navigation; the sign-in screen is skipped. */
  signedInPage: Page;
}

export const test = base.extend<Fixtures>({
  api: [
    async ({ request }, use) => {
      const api = new ApiClient(request);
      await api.reset();
      await api.signIn(ADMIN.email, ADMIN.password);
      await use(api);
    },
    { auto: true },
  ],

  signedInPage: async ({ page, api }, use) => {
    await page.addInitScript(
      ({ tokenKey, seededKey, token }) => {
        if (sessionStorage.getItem(seededKey)) return;
        sessionStorage.setItem(seededKey, '1');
        sessionStorage.setItem(tokenKey, token);
      },
      { tokenKey: TOKEN_KEY, seededKey: SEEDED_KEY, token: api.token },
    );
    await use(page);
  },
});
