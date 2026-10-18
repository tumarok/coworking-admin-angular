import { createApi } from '@server/core/api';
import { withinOpeningHours } from '@server/core/rules';
import { createMswHandlers } from '@server/msw';
import { server } from './msw-server';

/** A fixed "now" so seeded data and date-dependent rules are stable across runs. */
export const TEST_NOW = Date.parse('2026-10-14T09:00:00.000Z');

/** Serves the real mock API (the same core as `npm run mock`) to the code under test. */
export function installMockApi() {
  const api = createApi({ now: TEST_NOW, clock: () => TEST_NOW });
  server.use(...createMswHandlers(api));
  return api;
}

/** Requests go out with a valid demo token, as after a real sign-in. */
export function signIn(): void {
  sessionStorage.setItem('coworking-admin.token', 'demo-token.usr_admin');
}

/**
 * A future confirmed booking whose time sits inside its location's opening hours, so booking the
 * same slot again fails only because of the overlap.
 */
export function findBookedSlot(api: ReturnType<typeof installMockApi>) {
  const { db } = api;
  for (const existing of db.bookings) {
    if (existing.status !== 'confirmed' || Date.parse(existing.startsAt) <= TEST_NOW) continue;
    const room = db.rooms.find((r) => r.id === existing.roomId);
    const location = db.locations.find((l) => l.id === room?.locationId);
    if (!room || !location || room.capacity < 2) continue;
    if (!withinOpeningHours(location, existing.startsAt, existing.endsAt)) continue;
    const member = db.members.find((m) => m.status === 'active');
    if (member) return { existing, room, location, member };
  }
  throw new Error('seed has no suitable booking');
}
