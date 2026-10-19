import type { Booking } from '@shared/api/contract';
import { PLACEHOLDER } from '@shared/util/format';
import { timeSpan } from '@shared/util/time-span';

/** What to read where a booking's room or member no longer exists, instead of a bare dash. */
export const DELETED_ROOM = 'Deleted room';
export const DELETED_MEMBER = 'Deleted member';

/** Read where a booking's location cannot be told: the room is gone, or its location is. */
export const UNKNOWN_LOCATION = 'Unknown location';
export const DELETED_LOCATION = 'Deleted location';

/** The IANA time zone of each location, by its id. */
export type TimeZones = ReadonlyMap<string, string>;

/**
 * Whether the booking's room still exists. The API fills `roomName` from the room and answers the
 * placeholder dash when there is none.
 */
export const hasRoom = (booking: Pick<Booking, 'roomName'>): boolean =>
  booking.roomName !== PLACEHOLDER;

/** Whether the booking's member still exists. */
export const hasMember = (booking: Pick<Booking, 'memberName'>): boolean =>
  booking.memberName !== PLACEHOLDER;

/**
 * Whether the booking's location is known. The API sends an empty `locationId` when the room is
 * gone and the placeholder name when the room's location is.
 */
export const hasLocation = (booking: Pick<Booking, 'locationId' | 'locationName'>): boolean =>
  booking.locationId !== '' && booking.locationName !== PLACEHOLDER;

/** What to read for the booking's location when it has none to link to. */
export const missingLocation = (booking: Pick<Booking, 'roomName'>): string =>
  hasRoom(booking) ? DELETED_LOCATION : UNKNOWN_LOCATION;

/** What names a booking where there is no heading for it: `Room name, 01 Jul 2026, 09:00–11:30`. */
export const bookingLabel = (
  booking: Pick<Booking, 'roomName' | 'startsAt' | 'endsAt'>,
  timeZone?: string,
): string =>
  `${hasRoom(booking) ? booking.roomName : DELETED_ROOM}, ${timeSpan(booking, timeZone)}`;
