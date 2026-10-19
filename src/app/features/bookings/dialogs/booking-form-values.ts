import {
  type Booking,
  type BookingInput,
  bookingInputSchema,
  timeOfDaySchema,
} from '@shared/api/contract';
import { numberField } from '@shared/forms/number-schema';
import { utcToZoned, zonedToUtcIso } from '@shared/util/timezone';
import { z } from 'zod';
import { FALLBACK_TIME_ZONE, hasMember, hasRoom } from '../booking-display';

/**
 * The booking form's schema. The form differs from the API's input in how a time is written: a day
 * and two clock times (`HH:mm`) in the room's time zone instead of two instants, so the fields are
 * these, and {@link toBookingInput} turns them into the API's.
 *
 * - Room and member are chosen from a search, so an empty choice reads "Choose a room".
 * - The attendees may be empty while typing, which a number input holds as `null`.
 * - Whether the end is after the start and within 8 hours depends on the zone, which is not known
 *   to a static schema: see {@link slotProblem}.
 *
 * Messages that the API words too are the API's: the form and the server agree.
 */
export const bookingFormSchema = z.object({
  roomId: z.string().min(1, { error: 'Choose a room' }),
  memberId: z.string().min(1, { error: 'Choose a member' }),
  date: z.iso.date({ error: 'Pick a date' }),
  startTime: timeOfDaySchema,
  endTime: timeOfDaySchema,
  attendees: numberField(
    'Enter a number',
    z.number().int({ error: 'Enter a whole number' }).min(1, { error: 'At least 1 person' }),
  ),
  notes: z.string().trim().max(500, { error: 'At most 500 characters' }),
});

/** What the form edits. The attendees may be empty (see the schema). */
export type BookingFormValues = z.input<typeof bookingFormSchema>;

/**
 * A day with no change of the clock in any zone the API knows, to compare two times on before the
 * day has been typed: the order of the times does not depend on the day.
 */
const REFERENCE_DAY = '2000-01-03';

/** A booking starts on a morning hour, for an hour. */
const DEFAULT_START = '09:00';
const DEFAULT_END = '10:00';

export interface BookingFormStart {
  /** The booking to edit; none for a new one. */
  booking?: Booking;
  /** The clock of the booking's location, which its times are shown on; UTC when it is unknown. */
  timeZone?: string;
  /** Chosen in advance for a new booking (a link from a room or a member). */
  roomId?: string;
  memberId?: string;
}

/**
 * The values to start the form from: the booking being edited, as its location's clock reads it, or
 * the defaults for a new one. A room or a member that no longer exists cannot be kept: the field
 * starts empty and asks for another.
 */
export function toBookingFormValues({
  booking,
  timeZone = FALLBACK_TIME_ZONE,
  roomId = '',
  memberId = '',
}: BookingFormStart = {}): BookingFormValues {
  if (!booking) {
    return {
      roomId,
      memberId,
      date: '',
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
      attendees: 1,
      notes: '',
    };
  }
  const start = utcToZoned(booking.startsAt, timeZone);
  const end = utcToZoned(booking.endsAt, timeZone);
  return {
    roomId: hasRoom(booking) ? booking.roomId : '',
    memberId: hasMember(booking) ? booking.memberId : '',
    date: start?.date ?? '',
    startTime: start?.time ?? '',
    endTime: end?.time ?? '',
    attendees: booking.attendees,
    notes: booking.notes ?? '',
  };
}

/** The instants a day and two clock times stand for in a zone; `undefined` when one is unreadable. */
export function slotOf(
  values: Pick<BookingFormValues, 'date' | 'startTime' | 'endTime'>,
  timeZone: string,
): { startsAt: string; endsAt: string } | undefined {
  const startsAt = zonedToUtcIso(values.date, values.startTime, timeZone);
  const endsAt = zonedToUtcIso(values.date, values.endTime, timeZone);
  return startsAt && endsAt ? { startsAt, endsAt } : undefined;
}

/**
 * What is wrong with the span between the two times, in the words of the API: the end is not after
 * the start, or the booking is longer than the longest allowed. The length is measured between the
 * instants, so a night when the clock changes counts as the hours it really has, as the server
 * counts it. Without a readable day the times are compared on an ordinary one. Nothing is said while
 * a time cannot be read: its own error says so.
 */
export function slotProblem(
  values: Pick<BookingFormValues, 'date' | 'startTime' | 'endTime'>,
  timeZone: string,
): string | undefined {
  const date = zonedToUtcIso(values.date, '00:00', timeZone) ? values.date : REFERENCE_DAY;
  const slot = slotOf({ ...values, date }, timeZone);
  if (!slot) return undefined;
  // The contract owns the rule and its words; the fields this form checks itself are filled with
  // placeholders that satisfy it.
  const result = bookingInputSchema.safeParse({
    roomId: '-',
    memberId: '-',
    attendees: 1,
    notes: null,
    ...slot,
  });
  return result.error?.issues.find((issue) => issue.path[0] === 'endsAt')?.message;
}

/**
 * The API's input for valid form values, with the times read on the room's clock, the notes
 * trimmed and left empty as `null`. `undefined` when a time cannot be read.
 */
export function toBookingInput(
  values: BookingFormValues,
  timeZone: string,
): BookingInput | undefined {
  const slot = slotOf(values, timeZone);
  const parsed = bookingFormSchema.safeParse(values);
  if (!slot || !parsed.success) return undefined;
  const { roomId, memberId, attendees, notes } = parsed.data;
  return { roomId, memberId, ...slot, attendees, notes: notes || null };
}
