import { configure } from '@testing-library/angular';
import '@testing-library/jest-dom/vitest';
import { server } from './msw-server';

// The suite runs many jsdom files in parallel, so a dialog or a lazy page that takes 200 ms alone can
// take seconds on a busy machine. These limits are for that, not for slow code: a test that waits
// for something that never comes still fails, just later.
const SLOW_MACHINE_MS = { test: 30_000, wait: 5_000 };
vi.setConfig({ testTimeout: SLOW_MACHINE_MS.test, hookTimeout: SLOW_MACHINE_MS.test });
// Testing Library's `findBy*` and `waitFor`.
configure({ dom: { asyncUtilTimeout: SLOW_MACHINE_MS.wait } });
// `vi.waitFor` waits one second unless told otherwise, and has no global setting.
const waitFor = vi.waitFor.bind(vi);
vi.waitFor = (callback, options) =>
  waitFor(callback, {
    timeout: SLOW_MACHINE_MS.wait,
    ...(typeof options === 'number' ? { timeout: options } : options),
  });

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
