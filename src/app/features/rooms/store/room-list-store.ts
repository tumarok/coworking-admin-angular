import { signalStore } from '@ngrx/signals';
import { ROOM_STATUSES, ROOM_TYPES } from '@shared/api/contract';
import { enumFilter, textFilter } from '@shared/util/list-params';
import { withListParams } from '@shared/util/with-list-params';

/**
 * The state of the rooms list: page, page size, search, location, type and status, all in the URL
 * (`?locationId=loc_1` is what a location's page links to). Provide it on the page
 * (`providers: [RoomListStore]`), not in root, so it reads the page's own route.
 */
export const RoomListStore = signalStore(
  withListParams({
    filters: {
      locationId: textFilter,
      type: enumFilter(ROOM_TYPES),
      status: enumFilter(ROOM_STATUSES),
    },
  }),
);
