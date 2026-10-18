import type { BookingConflict, BookingInput, BookingStatus } from '@shared/api/contract';

import type { BookingRecord, Db, LocationRecord, RoomRecord } from './db';
import { conflict, invalid } from './http';

const HOUR = 3_600_000;

/** Statuses that keep a room occupied. */
const OCCUPYING: readonly BookingStatus[] = ['pending', 'confirmed', 'checked_in'];

export const isOccupying = (status: BookingStatus) => OCCUPYING.includes(status);

/** Wall-clock "HH:mm" of an instant in the given IANA time zone. */
export const localTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

/** Calendar date "YYYY-MM-DD" of an instant in the given IANA time zone. */
export const localDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));

export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);

export const bookingPrice = (
  room: Pick<RoomRecord, 'hourlyRate'>,
  startsAt: string,
  endsAt: string,
) => Math.round((room.hourlyRate * (Date.parse(endsAt) - Date.parse(startsAt))) / HOUR);

export const findConflicts = (
  db: Db,
  roomId: string,
  startsAt: string,
  endsAt: string,
  excludeId?: string,
): BookingConflict[] =>
  db.bookings
    .filter(
      (b) =>
        b.roomId === roomId &&
        b.id !== excludeId &&
        isOccupying(b.status) &&
        overlaps(startsAt, endsAt, b.startsAt, b.endsAt),
    )
    .map(({ id, startsAt: s, endsAt: e }) => ({ id, startsAt: s, endsAt: e }));

export const withinOpeningHours = (location: LocationRecord, startsAt: string, endsAt: string) =>
  localDate(startsAt, location.timezone) === localDate(endsAt, location.timezone) &&
  localTime(startsAt, location.timezone) >= location.opensAt &&
  localTime(endsAt, location.timezone) <= location.closesAt;

/**
 * Business rules a booking must satisfy on top of the contract schema. Field problems become
 * 422 (shown under the form fields); an overlap becomes 409 with the conflicting bookings.
 */
export const assertBookable = (db: Db, input: BookingInput, excludeId?: string) => {
  const room = db.rooms.find((r) => r.id === input.roomId);
  if (!room) throw invalid({ roomId: 'Room not found' });
  const location = db.locations.find((l) => l.id === room.locationId);
  if (!location) throw invalid({ roomId: 'Room has no location' });

  const fieldErrors: Record<string, string> = {};
  if (room.status !== 'available') fieldErrors['roomId'] = 'This room is not available for booking';
  else if (location.status !== 'active') fieldErrors['roomId'] = 'This location is closed';

  const member = db.members.find((m) => m.id === input.memberId);
  if (!member) fieldErrors['memberId'] = 'Member not found';
  else if (member.status !== 'active') fieldErrors['memberId'] = `Member is ${member.status}`;

  if (input.attendees > room.capacity) {
    fieldErrors['attendees'] = `This room seats up to ${room.capacity}`;
  }
  if (!withinOpeningHours(location, input.startsAt, input.endsAt)) {
    fieldErrors['startsAt'] =
      `Outside opening hours (${location.opensAt}–${location.closesAt} local time)`;
  }
  if (Object.keys(fieldErrors).length > 0) throw invalid(fieldErrors);

  const conflicts = findConflicts(db, room.id, input.startsAt, input.endsAt, excludeId);
  if (conflicts.length > 0) {
    throw conflict('The room is already booked for this time', { conflicts });
  }
  return room;
};

export const hasUpcomingBookings = (bookings: BookingRecord[], now = Date.now()) =>
  bookings.some((b) => isOccupying(b.status) && Date.parse(b.endsAt) > now);
