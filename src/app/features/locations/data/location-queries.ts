import { createQuery, type QueryRef } from '@core/api/create-query';
import { parseResponse } from '@core/api/parse-response';
import { idTag, listTag } from '@core/api/tags';
import {
  type Location,
  type LocationStatus,
  locationSchema,
  type Page,
  pageOf,
} from '@shared/api/contract';

/** What the locations list asks the API for; the list store's `params()` has exactly this shape. */
export interface LocationListParams {
  /** 1-based. */
  page: number;
  limit: number;
  q: string;
  status?: LocationStatus;
}

/** One page of locations. Follows `params`, so a new page, search or filter is a new request. */
export function injectLocationsQuery(params: () => LocationListParams): QueryRef<Page<Location>> {
  return createQuery({
    request: () => {
      const { page, limit, q, status } = params();
      return { url: '/locations', params: { page, limit, q, status } };
    },
    tags: () => [listTag('Location')],
    parse: parseResponse(pageOf(locationSchema), 'GET /locations'),
  });
}

/** One location by id. */
export function injectLocationQuery(id: () => string): QueryRef<Location> {
  return createQuery({
    request: () => ({ url: `/locations/${encodeURIComponent(id())}` }),
    tags: () => [idTag('Location', id())],
    parse: parseResponse(locationSchema, 'GET /locations/:id'),
  });
}
