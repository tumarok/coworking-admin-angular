import '@testing-library/jest-dom/vitest';
import { server } from './msw-server';

// jsdom does not implement element scrolling, which the shell and the CDK scrollables call.
Element.prototype.scrollTo = () => undefined;

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
