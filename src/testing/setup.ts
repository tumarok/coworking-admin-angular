import '@testing-library/jest-dom/vitest';
import { server } from './msw-server';

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => {
  server.close();
});
