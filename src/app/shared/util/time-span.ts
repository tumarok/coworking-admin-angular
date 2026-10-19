import { formatTimeRange } from './format';

/** The clock used for a booking whose location is not known: the API's own. */
export const FALLBACK_TIME_ZONE = 'UTC';

/** A span between two instants on a clock; without a zone it reads in UTC and says so. */
export function timeSpan(booking: { startsAt: string; endsAt: string }, timeZone?: string): string {
  const range = formatTimeRange(booking.startsAt, booking.endsAt, timeZone ?? FALLBACK_TIME_ZONE);
  return timeZone ? range : `${range} ${FALLBACK_TIME_ZONE}`;
}
