import { beforeEach, describe, expect, it } from 'vitest';

import type { Booking, LoginResponse, Page } from '@shared/api/contract';

import { type MockApi, createApi } from './api';
import { DEMO_PASSWORD } from './db';

const NOW = Date.parse('2026-10-14T09:00:00.000Z');

let api: MockApi;
let auth: string;

const call = (method: string, path: string, body?: unknown, query: Record<string, string> = {}) =>
  api.handle({ method, path, query, body, authorization: auth });

beforeEach(() => {
  api = createApi({ now: NOW, clock: () => NOW });
  const login = api.handle({
    method: 'POST',
    path: '/auth/login',
    query: {},
    body: { email: 'admin@coworking.test', password: DEMO_PASSWORD },
  });
  auth = `Bearer ${(login.body as LoginResponse).token}`;
});

describe('mock API', () => {
  it('rejects a wrong password with 401 and requires a token elsewhere', () => {
    const login = api.handle({
      method: 'POST',
      path: '/auth/login',
      query: {},
      body: { email: 'admin@coworking.test', password: 'nope' },
    });
    expect(login.status).toBe(401);
    expect(api.handle({ method: 'GET', path: '/locations', query: {} }).status).toBe(401);
  });

  it('paginates and filters lists', () => {
    const first = call('GET', '/members', undefined, { page: '1', limit: '10' });
    const page = first.body as Page<unknown>;
    expect(first.status).toBe(200);
    expect(page.items).toHaveLength(10);
    expect(page.total).toBeGreaterThan(10);

    const active = call('GET', '/members', undefined, { status: 'active', limit: '100' });
    const items = (active.body as Page<{ status: string }>).items;
    expect(items.every((m) => m.status === 'active')).toBe(true);
  });

  it('returns field errors for an invalid payload', () => {
    const res = call('POST', '/locations', { name: 'X' });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ fieldErrors: { name: expect.any(String) as unknown } });
  });

  it('refuses to delete a location that still has rooms', () => {
    const location = api.db.locations[0];
    expect(call('DELETE', `/locations/${location?.id}`).status).toBe(409);
  });

  it('confirms what it can in bulk and explains the rest', () => {
    const firstWith = (status: string) =>
      (call('GET', '/bookings', undefined, { status }).body as Page<Booking>).items[0];
    const pending = firstWith('pending');
    const completed = firstWith('completed');
    if (!pending || !completed) throw new Error('seed lacks pending or completed bookings');

    const res = call('POST', '/bookings/bulk', {
      ids: [pending.id, completed.id],
      action: 'confirm',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      updated: [pending.id],
      failed: [{ id: completed.id, reason: 'Cannot confirm a booking that is completed' }],
    });
  });

  it('enforces status transitions', () => {
    const bookings = (
      call('GET', '/bookings', undefined, { status: 'completed' }).body as Page<Booking>
    ).items;
    const res = call('POST', `/bookings/${bookings[0]?.id}/status`, { status: 'pending' });
    expect(res.status).toBe(409);
  });

  it('builds a dashboard for a given day', () => {
    const res = call('GET', '/dashboard', undefined, { date: '2026-10-14' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      date: '2026-10-14',
      kpis: { occupancyRate: expect.any(Number) as unknown },
    });
  });
});
