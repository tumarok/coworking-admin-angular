import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApi } from './core/api';
import { DEMO_PASSWORD } from './core/db';
import { createMswHandlers } from './msw';

const server = setupServer(
  ...createMswHandlers(createApi({ now: Date.parse('2026-10-14T09:00:00Z') })),
);

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterAll(() => {
  server.close();
});

describe('MSW adapter', () => {
  it('serves the mock API through fetch', async () => {
    const login = await fetch('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@coworking.test', password: DEMO_PASSWORD }),
    });
    expect(login.status).toBe(200);
    const { token } = (await login.json()) as { token: string };

    const rooms = await fetch('http://localhost/api/v1/rooms?limit=5', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(rooms.status).toBe(200);
    expect(((await rooms.json()) as { items: unknown[] }).items).toHaveLength(5);
  });
});
