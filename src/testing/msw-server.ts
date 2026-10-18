import { setupServer } from 'msw/node';

/**
 * Network layer for specs. Every spec declares the responses it needs with `server.use(...)`; an
 * unhandled request fails the test instead of silently hanging.
 */
export const server = setupServer();

/**
 * The API prefix as a full URL. Node's `fetch`, which backs `HttpClient` in specs, rejects
 * relative URLs, so the app's base URL has to be absolute under test.
 */
export const apiUrl = (path: string) => `http://localhost/api/v1${path}`;
