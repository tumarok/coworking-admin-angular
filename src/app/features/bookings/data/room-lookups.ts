import { createQuery, type QueryRef } from '@core/api/create-query';
import { parseResponse } from '@core/api/parse-response';
import { idTag, listTag } from '@core/api/tags';
import { type Page, pageOf, type Room, roomSchema } from '@shared/api/contract';
import { LOOKUP_PAGE_SIZE } from './lookup-size';

/**
 * The rooms that match a search, for the room field of the form: the first page of those a booking
 * can be made in (`status=available`). The server does the searching, so a network of any size
 * works; the field asks again as the text changes.
 */
export function injectRoomSearch(search: () => string): QueryRef<Page<Room>> {
  return createQuery({
    request: () => ({
      url: '/rooms',
      params: { page: 1, limit: LOOKUP_PAGE_SIZE, q: search(), status: 'available' },
    }),
    tags: () => [listTag('Room')],
    parse: parseResponse(pageOf(roomSchema), 'GET /rooms'),
  });
}

/**
 * One room by id, whatever its status: the room of a booking being edited, a prefilled room and the
 * room named by a filter in the address. Without an id (`undefined`) nothing is asked.
 */
export function injectRoomById(id: () => string | undefined): QueryRef<Room> {
  return createQuery({
    request: () => {
      const roomId = id();
      return roomId ? { url: `/rooms/${encodeURIComponent(roomId)}` } : undefined;
    },
    tags: () => {
      const roomId = id();
      return roomId ? [idTag('Room', roomId)] : [];
    },
    parse: parseResponse(roomSchema, 'GET /rooms/:id'),
  });
}
