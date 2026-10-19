import { createQuery, type QueryRef } from '@core/api/create-query';
import { parseResponse } from '@core/api/parse-response';
import { idTag, listTag } from '@core/api/tags';
import {
  type Booking,
  bookingSchema,
  type BookingStatus,
  type Page,
  pageOf,
} from '@shared/api/contract';

/** What the bookings list asks the API for; the list store's `params()` has exactly this shape. */
export interface BookingListParams {
  /** 1-based. */
  page: number;
  limit: number;
  q: string;
  /** First and last day, as `YYYY-MM-DD`; both count, by the day of the start in UTC. */
  from?: string;
  to?: string;
  status?: BookingStatus;
  locationId?: string;
  roomId?: string;
  memberId?: string;
}

/** One page of bookings. Follows `params`, so a new page, search or filter is a new request. */
export function injectBookingsQuery(params: () => BookingListParams): QueryRef<Page<Booking>> {
  return createQuery({
    request: () => {
      const { page, limit, q, from, to, status, locationId, roomId, memberId } = params();
      return {
        url: '/bookings',
        params: { page, limit, q, from, to, status, locationId, roomId, memberId },
      };
    },
    tags: () => [listTag('Booking')],
    parse: parseResponse(pageOf(bookingSchema), 'GET /bookings'),
  });
}

/** One booking by id. */
export function injectBookingQuery(id: () => string): QueryRef<Booking> {
  return createQuery({
    request: () => ({ url: `/bookings/${encodeURIComponent(id())}` }),
    tags: () => [idTag('Booking', id())],
    parse: parseResponse(bookingSchema, 'GET /bookings/:id'),
  });
}
