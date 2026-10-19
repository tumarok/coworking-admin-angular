import { signalStore } from '@ngrx/signals';
import { LOCATION_STATUSES } from '@shared/api/contract';
import { enumFilter } from '@shared/util/list-params';
import { withListParams } from '@shared/util/with-list-params';

/**
 * The state of the locations list: page, page size, search and status, all in the URL. Provide it on
 * the page (`providers: [LocationListStore]`), not in root, so it reads the page's own route.
 */
export const LocationListStore = signalStore(
  withListParams({ filters: { status: enumFilter(LOCATION_STATUSES) } }),
);
