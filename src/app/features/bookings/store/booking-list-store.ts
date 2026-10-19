import { signalStore } from '@ngrx/signals';
import { BOOKING_STATUSES } from '@shared/api/contract';
import { dateFilter, enumFilter, textFilter } from '@shared/util/list-params';
import { withListParams } from '@shared/util/with-list-params';

/**
 * The state of the bookings list: page, page size, search, the first and last day, status,
 * location, room and member, all in the URL. `?memberId=` is what a member's page links to. Provide
 * it on the page (`providers: [BookingListStore]`), not in root, so it reads the page's own route.
 */
export const BookingListStore = signalStore(
  withListParams({
    filters: {
      from: dateFilter,
      to: dateFilter,
      status: enumFilter(BOOKING_STATUSES),
      locationId: textFilter,
      roomId: textFilter,
      memberId: textFilter,
    },
  }),
);
