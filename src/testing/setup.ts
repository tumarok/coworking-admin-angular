import '@testing-library/jest-dom/vitest';
import { server } from './msw-server';

// jsdom does not implement element scrolling, which the shell, the CDK scrollables and the
// timepicker's list (it scrolls the selected time into view) call.
Element.prototype.scrollTo = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

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
