import { createMutation, type MutationRef } from '@core/api/create-mutation';
import { parseResponse } from '@core/api/parse-response';
import { removedTags, savedTags } from '@core/api/tags';
import { type Room, type RoomInput, roomSchema } from '@shared/api/contract';

export interface UpdateRoomArg {
  id: string;
  input: RoomInput;
}

/**
 * Creates a room. The form shows a refusal itself, so no snackbar (`silent`). The lists reload,
 * and so does everything that shows a room's data: its location's room count, the bookings that
 * carry its name (see `savedTags`).
 */
export function injectCreateRoom(): MutationRef<RoomInput, Room> {
  return createMutation({
    request: (input) => ({ method: 'POST', url: '/rooms', body: input, silent: true }),
    parse: parseResponse(roomSchema, 'POST /rooms'),
    invalidates: () => savedTags('Room'),
  });
}

/**
 * Updates a room with its whole input: a PATCH, though the API takes no partial update. Silent like
 * the create: the form reports.
 */
export function injectUpdateRoom(): MutationRef<UpdateRoomArg, Room> {
  return createMutation({
    request: ({ id, input }) => ({
      method: 'PATCH',
      url: `/rooms/${id}`,
      body: input,
      silent: true,
    }),
    parse: parseResponse(roomSchema, 'PATCH /rooms/:id'),
    invalidates: (_arg, saved) => savedTags('Room', saved.id),
  });
}

/**
 * Deletes a room. Not silent: a 409 (it still has upcoming bookings) reaches the person as a
 * snackbar with the server's reason, and they stay where they are. The room's own detail is not
 * invalidated, as reloading it would answer 404 while its page is still open (see `removedTags`).
 */
export function injectDeleteRoom(): MutationRef<string, void> {
  return createMutation({
    request: (id) => ({ method: 'DELETE', url: `/rooms/${id}` }),
    invalidates: () => removedTags('Room'),
  });
}
