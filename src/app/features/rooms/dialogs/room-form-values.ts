import { AMENITIES, type Room, roomInputSchema } from '@shared/api/contract';
import { centsToEuros, eurosToCents, formatMoney } from '@shared/util/format';
import { z } from 'zod';
import { hasLocation } from '../room-location';

/** The most an hour can cost: the API's limit in cents, as euros and as the message words it. */
const MAX_RATE_CENTS = 1_000_000;
const MAX_RATE_EUROS = centsToEuros(MAX_RATE_CENTS);

/**
 * A number field the person may leave empty (a native number input then holds `null`): the empty
 * field gets its own message, and a number goes on to the contract's rule.
 */
const numberField = <T extends z.ZodType<number, number>>(missing: string, rule: T) =>
  z
    .number()
    .nullable()
    .pipe(z.number({ error: missing }))
    .pipe(rule);

/**
 * The room form's schema: the contract's own input schema where the form and the API agree, and
 * three differences that belong to the form.
 *
 * - The location is chosen from a list, so an empty choice reads "Choose a location".
 * - The rate is typed in euros. It is checked in euros (the contract's limit, from nothing up to
 *   {@link MAX_RATE_EUROS}, in whole cents) and parsed into the cents the API takes.
 * - Seats are whole numbers, which the field words itself before the contract's range applies.
 * - Seats and rate may be empty while typing, which a number input holds as `null`.
 *
 * `roomFormSchema.parse(values)` is therefore the `RoomInput` to send.
 */
export const roomFormSchema = roomInputSchema.extend({
  locationId: z.string().min(1, { error: 'Choose a location' }),
  capacity: numberField(
    'Enter the number of seats',
    z.number().int({ error: 'Enter a whole number' }).pipe(roomInputSchema.shape.capacity),
  ),
  hourlyRate: numberField(
    'Enter a rate',
    z
      .number()
      .min(0, { error: 'Cannot be negative' })
      .max(MAX_RATE_EUROS, { error: `At most ${formatMoney(MAX_RATE_CENTS)}` })
      // A float product is never exact (1.005 * 100 is 100.49999999999999), so "whole cents" allows
      // for the error of the multiplication instead of testing it for an integer.
      .refine((euros) => Math.abs(euros * 100 - Math.round(euros * 100)) < 1e-6, {
        error: 'Use at most 2 decimals',
      })
      .transform(eurosToCents)
      .pipe(roomInputSchema.shape.hourlyRate),
  ),
});

/** What the form edits. The rate is in euros and the numbers may be empty (see the schema). */
export type RoomFormValues = z.input<typeof roomFormSchema>;

/** A new room: a meeting room for six at €25 an hour, with the location still to choose. */
const newRoom = (): RoomFormValues => ({
  locationId: '',
  name: '',
  type: 'meeting_room',
  capacity: 6,
  hourlyRate: 25,
  amenities: [],
  status: 'available',
});

/** The values to start the form from: the room being edited, or the defaults for a new one. */
export function toRoomFormValues(room?: Room): RoomFormValues {
  if (!room) return newRoom();
  return {
    // A location that no longer exists cannot be kept: the field starts empty and asks for another.
    locationId: hasLocation(room) ? room.locationId : '',
    name: room.name,
    type: room.type,
    capacity: room.capacity,
    hourlyRate: centsToEuros(room.hourlyRate),
    // In the order of the list, as the select reports them, so an untouched field is unchanged.
    amenities: AMENITIES.filter((amenity) => room.amenities.includes(amenity)),
    status: room.status,
  };
}
