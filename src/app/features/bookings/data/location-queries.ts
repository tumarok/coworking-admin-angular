import { createQuery, type QueryRef } from '@core/api/create-query';
import { parseResponse } from '@core/api/parse-response';
import { idTag, listTag } from '@core/api/tags';
import {
  type Location,
  locationSchema,
  MAX_PAGE_SIZE,
  type Page,
  pageOf,
} from '@shared/api/contract';

/**
 * The locations, for the filter of the list and for the clock a booking reads on: its location's
 * time zone. A booking feature may not import the locations feature, so it asks the API itself: one
 * page of the biggest size the API allows.
 */
export function injectLocationsQuery(): QueryRef<Page<Location>> {
  return createQuery({
    request: () => ({ url: '/locations', params: { page: 1, limit: MAX_PAGE_SIZE } }),
    tags: () => [listTag('Location')],
    parse: parseResponse(pageOf(locationSchema), 'GET /locations'),
  });
}

/** One location by id; without an id (`undefined`) nothing is asked. */
export function injectLocationById(id: () => string | undefined): QueryRef<Location> {
  return createQuery({
    request: () => {
      const locationId = id();
      return locationId ? { url: `/locations/${encodeURIComponent(locationId)}` } : undefined;
    },
    tags: () => {
      const locationId = id();
      return locationId ? [idTag('Location', locationId)] : [];
    },
    parse: parseResponse(locationSchema, 'GET /locations/:id'),
  });
}
