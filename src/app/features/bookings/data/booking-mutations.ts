import { createMutation, type MutationRef } from '@core/api/create-mutation';
import { parseResponse } from '@core/api/parse-response';
import { savedTags } from '@core/api/tags';
import {
  type Booking,
  type BookingInput,
  bookingSchema,
  type BookingStatus,
  type BulkBookingRequest,
  type BulkBookingResult,
  bulkBookingResultSchema,
} from '@shared/api/contract';

export interface UpdateBookingArg {
  id: string;
  input: BookingInput;
}

export interface ChangeBookingStatusArg {
  id: string;
  status: BookingStatus;
}

/**
 * Creates a booking. The form shows a refusal itself (a field's 422, the 409 with the bookings in
 * the way), so no snackbar (`silent`). The lists reload, and so does the dashboard that counts them
 * (see `savedTags`).
 */
export function injectCreateBooking(): MutationRef<BookingInput, Booking> {
  return createMutation({
    request: (input) => ({ method: 'POST', url: '/bookings', body: input, silent: true }),
    parse: parseResponse(bookingSchema, 'POST /bookings'),
    invalidates: () => savedTags('Booking'),
  });
}

/**
 * Updates a booking with its whole input: a PATCH, though the API takes no partial update. Silent
 * like the create: the form reports.
 */
export function injectUpdateBooking(): MutationRef<UpdateBookingArg, Booking> {
  return createMutation({
    request: ({ id, input }) => ({
      method: 'PATCH',
      url: `/bookings/${id}`,
      body: input,
      silent: true,
    }),
    parse: parseResponse(bookingSchema, 'PATCH /bookings/:id'),
    invalidates: (_arg, saved) => savedTags('Booking', saved.id),
  });
}

/**
 * Moves a booking to its next status. Not silent: a 409 (the booking is no longer in a state that
 * allows the move) reaches the person as a snackbar with the server's reason, and the buttons stay
 * where they are. A success makes the booking, the lists and the dashboard stale, as a save does.
 */
export function injectChangeBookingStatus(): MutationRef<ChangeBookingStatusArg, Booking> {
  return createMutation({
    request: ({ id, status }) => ({
      method: 'POST',
      url: `/bookings/${id}/status`,
      body: { status },
    }),
    parse: parseResponse(bookingSchema, 'POST /bookings/:id/status'),
    invalidates: (_arg, changed) => savedTags('Booking', changed.id),
  });
}

/**
 * Confirms or cancels many bookings in one request; the answer says which were updated and which
 * were refused, and why. Not silent: a request that fails as a whole (a lost connection, a 5xx) is
 * a snackbar, while a booking that cannot make the move is a `failed` entry of a success. Only the
 * bookings that changed make anything stale, so a request that updated none reloads nothing.
 */
export function injectBulkBookings(): MutationRef<BulkBookingRequest, BulkBookingResult> {
  return createMutation({
    request: (body) => ({ method: 'POST', url: '/bookings/bulk', body }),
    parse: parseResponse(bulkBookingResultSchema, 'POST /bookings/bulk'),
    invalidates: (_arg, { updated }) =>
      updated.length > 0 ? savedTags('Booking', ...updated) : [],
  });
}
