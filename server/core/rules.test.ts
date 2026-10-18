import { describe, expect, it } from 'vitest';

import { createDb } from './db';
import { assertBookable, bookingPrice, localTime, overlaps, withinOpeningHours } from './rules';
import { HttpError } from './http';

const NOW = Date.parse('2026-10-14T09:00:00.000Z');

const firstBookableRoom = () => {
  const db = createDb({ now: NOW });
  const room = db.rooms.find((r) => {
    const location = db.locations.find((l) => l.id === r.locationId);
    return r.status === 'available' && location?.status === 'active';
  });
  const member = db.members.find((m) => m.status === 'active');
  if (!room || !member) throw new Error('seed has no bookable room or active member');
  return { db, room, member };
};

describe('booking rules', () => {
  it('detects overlapping intervals but not touching ones', () => {
    expect(
      overlaps('2026-01-01T09:00Z', '2026-01-01T10:00Z', '2026-01-01T09:30Z', '2026-01-01T11:00Z'),
    ).toBe(true);
    expect(
      overlaps('2026-01-01T09:00Z', '2026-01-01T10:00Z', '2026-01-01T10:00Z', '2026-01-01T11:00Z'),
    ).toBe(false);
  });

  it('prices by the hour in cents', () => {
    expect(bookingPrice({ hourlyRate: 2500 }, '2026-01-01T09:00Z', '2026-01-01T10:30Z')).toBe(3750);
  });

  it('reads wall-clock time in the location time zone', () => {
    expect(localTime('2026-07-01T06:00:00.000Z', 'Europe/Kyiv')).toBe('09:00');
    expect(localTime('2026-07-01T06:00:00.000Z', 'Europe/Lisbon')).toBe('07:00');
  });

  it('checks opening hours in local time', () => {
    const location = {
      id: 'l',
      name: 'L',
      city: 'C',
      address: 'A',
      timezone: 'Europe/Kyiv' as const,
      opensAt: '08:00',
      closesAt: '20:00',
      status: 'active' as const,
    };
    expect(
      withinOpeningHours(location, '2026-07-01T06:00:00.000Z', '2026-07-01T08:00:00.000Z'),
    ).toBe(true);
    expect(
      withinOpeningHours(location, '2026-07-01T04:00:00.000Z', '2026-07-01T06:00:00.000Z'),
    ).toBe(false);
  });

  it('rejects too many attendees with a field error', () => {
    const { db, room, member } = firstBookableRoom();
    const attempt = () =>
      assertBookable(db, {
        roomId: room.id,
        memberId: member.id,
        startsAt: '2026-10-20T09:00:00.000Z',
        endsAt: '2026-10-20T10:00:00.000Z',
        attendees: room.capacity + 1,
        notes: null,
      });
    expect(attempt).toThrow(HttpError);
    try {
      attempt();
    } catch (error) {
      expect((error as HttpError).status).toBe(422);
      expect((error as HttpError).body.fieldErrors?.['attendees']).toMatch(/seats up to/);
    }
  });

  it('reports overlapping bookings as a 409 with the conflicts', () => {
    const { db, room, member } = firstBookableRoom();
    db.bookings.push({
      id: 'bk_existing',
      roomId: room.id,
      memberId: member.id,
      startsAt: '2026-10-20T09:00:00.000Z',
      endsAt: '2026-10-20T11:00:00.000Z',
      attendees: 1,
      status: 'confirmed',
      notes: null,
      totalPrice: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    try {
      assertBookable(db, {
        roomId: room.id,
        memberId: member.id,
        startsAt: '2026-10-20T10:00:00.000Z',
        endsAt: '2026-10-20T12:00:00.000Z',
        attendees: 1,
        notes: null,
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as HttpError).status).toBe(409);
      expect((error as HttpError).body.conflicts?.map((c) => c.id)).toContain('bk_existing');
    }
  });
});
