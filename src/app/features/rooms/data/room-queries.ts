import { createQuery, type QueryRef } from '@core/api/create-query';
import { parseResponse } from '@core/api/parse-response';
import { idTag, listTag } from '@core/api/tags';
import {
  type Page,
  pageOf,
  type Room,
  roomSchema,
  type RoomStatus,
  type RoomType,
} from '@shared/api/contract';

/** What the rooms list asks the API for; the list store's `params()` has exactly this shape. */
export interface RoomListParams {
  /** 1-based. */
  page: number;
  limit: number;
  q: string;
  locationId?: string;
  type?: RoomType;
  status?: RoomStatus;
}

/** One page of rooms. Follows `params`, so a new page, search or filter is a new request. */
export function injectRoomsQuery(params: () => RoomListParams): QueryRef<Page<Room>> {
  return createQuery({
    request: () => {
      const { page, limit, q, locationId, type, status } = params();
      return { url: '/rooms', params: { page, limit, q, locationId, type, status } };
    },
    tags: () => [listTag('Room')],
    parse: parseResponse(pageOf(roomSchema), 'GET /rooms'),
  });
}

/** One room by id. */
export function injectRoomQuery(id: () => string): QueryRef<Room> {
  return createQuery({
    request: () => ({ url: `/rooms/${encodeURIComponent(id())}` }),
    tags: () => [idTag('Room', id())],
    parse: parseResponse(roomSchema, 'GET /rooms/:id'),
  });
}
